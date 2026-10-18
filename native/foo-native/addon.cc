// Spec: 09 §9.19.2 (foo-native: one addon; sources jobobject, speech, netcost, toasthistory, toastsetting, textscale,
// keyboard, focus here; hello.cc = M10, wintrack.cc = M9, ocr.cc = its milestone add their Init line), 08-5 §6.
#include <windows.h>

#include <winrt/base.h>

#include "common.h"

namespace foo {

std::wstring Wide(const std::string& s) {
  if (s.empty()) return std::wstring();
  int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
  std::wstring out(static_cast<size_t>(n), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), out.data(), n);
  return out;
}

std::string Utf8(const std::wstring& s) {
  if (s.empty()) return std::string();
  int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0, nullptr, nullptr);
  std::string out(static_cast<size_t>(n), '\0');
  WideCharToMultiByte(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), out.data(), n, nullptr, nullptr);
  return out;
}

napi_value Undefined(napi_env env) {
  napi_value v;
  napi_get_undefined(env, &v);
  return v;
}

napi_value Null(napi_env env) {
  napi_value v;
  napi_get_null(env, &v);
  return v;
}

napi_value Str(napi_env env, const std::string& s) {
  napi_value v;
  napi_create_string_utf8(env, s.data(), s.size(), &v);
  return v;
}

napi_value Bool(napi_env env, bool b) {
  napi_value v;
  napi_get_boolean(env, b, &v);
  return v;
}

bool ArgString(napi_env env, napi_value v, std::string* out) {
  napi_valuetype t = napi_undefined;
  if (v == nullptr || napi_typeof(env, v, &t) != napi_ok || t != napi_string) {
    napi_throw_type_error(env, nullptr, "expected a string");
    return false;
  }
  size_t len = 0;
  napi_get_value_string_utf8(env, v, nullptr, 0, &len);
  out->assign(len, '\0');
  napi_get_value_string_utf8(env, v, out->data(), len + 1, &len);
  return true;
}

bool ArgPid(napi_env env, napi_value v, uint32_t* out) {
  napi_valuetype t = napi_undefined;
  double d = 0;
  if (v == nullptr || napi_typeof(env, v, &t) != napi_ok || t != napi_number || napi_get_value_double(env, v, &d) != napi_ok ||
      d <= 0 || d > 4294967295.0 || d != static_cast<double>(static_cast<uint32_t>(d))) {
    napi_throw_type_error(env, nullptr, "pid must be a positive integer");
    return false;
  }
  *out = static_cast<uint32_t>(d);
  return true;
}

napi_value MakeError(napi_env env, const char* code, const std::string& message) {
  napi_value c = Str(env, code);
  napi_value m = Str(env, message);
  napi_value err;
  napi_create_error(env, c, m, &err);
  return err;
}

void ThrowCode(napi_env env, const char* code, const std::string& message) {
  napi_throw(env, MakeError(env, code, message));
}

void EnsureApartment() {
  thread_local bool done = false;
  if (done) return;
  done = true;
  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
  } catch (...) {
    // RPC_E_CHANGED_MODE: this thread is already STA (Electron's main thread); WinRT's synchronous calls work there.
  }
}

void Export(napi_env env, napi_value exports, const char* name, napi_callback fn) {
  napi_value f;
  napi_create_function(env, name, NAPI_AUTO_LENGTH, fn, nullptr, &f);
  napi_set_named_property(env, exports, name, f);
}

}  // namespace foo

NAPI_MODULE_INIT() {
  foo::InitJobObject(env, exports);
  foo::InitSpeech(env, exports);
  foo::InitNetCost(env, exports);
  foo::InitToastHistory(env, exports);
  foo::InitToastSetting(env, exports);
  foo::InitTextScale(env, exports);
  foo::InitKeyboard(env, exports);
  foo::InitFocus(env, exports);
  return exports;
}
