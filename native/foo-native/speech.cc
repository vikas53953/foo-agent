// Spec: 08-3 §18.2 (Out: `synthesize(text, lang, outPath)` with WinRT SpeechSynthesizer and the installed Windows voices
// → WAV; voice = the first installed voice whose language tag starts with `lang`, none → en-IN reading the text as is,
// else the first en-*; no voice at all → VOICE_UNAVAILABLE so the reply stays text), 08-5 §6, M11 G-M11-02 (the engine
// decides what to read out and which `lang`; main only calls this). Runs on a worker thread; never blocks main.
#include <windows.h>

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.SpeechSynthesis.h>
#include <winrt/Windows.Storage.Streams.h>

#include <string>
#include <vector>

#include "common.h"

namespace {

using winrt::Windows::Media::SpeechSynthesis::SpeechSynthesizer;
using winrt::Windows::Media::SpeechSynthesis::VoiceInformation;

struct SpeakWork {
  napi_async_work work = nullptr;
  napi_deferred deferred = nullptr;
  std::wstring text;
  std::wstring lang;
  std::wstring outPath;
  const char* code = nullptr;  // null = success
  std::string message;
};

bool StartsWith(const std::wstring& tag, const std::wstring& prefix) {
  return !prefix.empty() && tag.size() >= prefix.size() && _wcsnicmp(tag.c_str(), prefix.c_str(), prefix.size()) == 0;
}

VoiceInformation PickVoice(const std::wstring& lang) {
  auto voices = SpeechSynthesizer::AllVoices();
  for (const std::wstring& want : {lang, std::wstring(L"en-IN"), std::wstring(L"en-")}) {
    for (const auto& v : voices) {
      if (StartsWith(std::wstring(v.Language()), want)) return v;
    }
  }
  return nullptr;
}

bool WriteAll(const std::wstring& path, const std::vector<uint8_t>& bytes) {
  HANDLE f = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f == INVALID_HANDLE_VALUE) return false;
  size_t done = 0;
  bool ok = true;
  while (done < bytes.size()) {
    DWORD wrote = 0;
    DWORD chunk = static_cast<DWORD>(bytes.size() - done > 0x10000000 ? 0x10000000 : bytes.size() - done);
    if (!WriteFile(f, bytes.data() + done, chunk, &wrote, nullptr) || wrote == 0) {
      ok = false;
      break;
    }
    done += wrote;
  }
  CloseHandle(f);
  if (!ok) DeleteFileW(path.c_str());
  return ok;
}

void Execute(napi_env, void* data) {
  auto* w = static_cast<SpeakWork*>(data);
  try {
    foo::EnsureApartment();
    VoiceInformation voice = PickVoice(w->lang);
    if (!voice) {
      w->code = "VOICE_UNAVAILABLE";
      w->message = "no installed Windows voice";
      return;
    }
    SpeechSynthesizer synth;
    synth.Voice(voice);
    auto stream = synth.SynthesizeTextToStreamAsync(winrt::hstring(w->text)).get();
    const uint32_t size = static_cast<uint32_t>(stream.Size());
    winrt::Windows::Storage::Streams::DataReader reader(stream.GetInputStreamAt(0));
    reader.LoadAsync(size).get();
    std::vector<uint8_t> bytes(size);
    reader.ReadBytes(bytes);
    if (!WriteAll(w->outPath, bytes)) {
      w->code = "VOICE_UNAVAILABLE";
      w->message = "could not write the WAV (" + std::to_string(GetLastError()) + ")";
    }
  } catch (const winrt::hresult_error& e) {
    w->code = "VOICE_UNAVAILABLE";
    w->message = foo::Utf8(std::wstring(e.message()));
  } catch (...) {
    w->code = "VOICE_UNAVAILABLE";
    w->message = "speech failed";
  }
}

void Complete(napi_env env, napi_status, void* data) {
  auto* w = static_cast<SpeakWork*>(data);
  if (w->code == nullptr) {
    napi_resolve_deferred(env, w->deferred, foo::Undefined(env));
  } else {
    napi_reject_deferred(env, w->deferred, foo::MakeError(env, w->code, w->message));
  }
  napi_delete_async_work(env, w->work);
  delete w;
}

napi_value Synthesize(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3] = {nullptr, nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::string text;
  std::string lang;
  std::string out;
  if (!foo::ArgString(env, argv[0], &text) || !foo::ArgString(env, argv[1], &lang) || !foo::ArgString(env, argv[2], &out)) {
    return nullptr;
  }
  auto* w = new SpeakWork();
  w->text = foo::Wide(text);
  w->lang = foo::Wide(lang);
  w->outPath = foo::Wide(out);
  napi_value promise;
  napi_create_promise(env, &w->deferred, &promise);
  napi_value name = foo::Str(env, "foo-native.synthesize");
  napi_create_async_work(env, nullptr, name, Execute, Complete, w, &w->work);
  napi_queue_async_work(env, w->work);
  return promise;
}

}  // namespace

namespace foo {

void InitSpeech(napi_env env, napi_value exports) {
  Export(env, exports, "synthesize", Synthesize);
}

}  // namespace foo
