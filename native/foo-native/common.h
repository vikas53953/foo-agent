// Spec: 09 §9.19.2 (one C++/WinRT N-API addon, main only; all toast functions use AUMID com.foo.desktop), 08-5 §6.
// Shared helpers for the foo-native sources: N-API argument reading, UTF-8 ⇄ UTF-16, errors with a `code`, and the
// COM apartment every WinRT call needs (MTA on worker threads; Electron's main thread is already STA).
#pragma once

#include <node_api.h>

#include <cstdint>
#include <string>

namespace foo {

constexpr const wchar_t* kAumid = L"com.foo.desktop";

std::wstring Wide(const std::string& s);
std::string Utf8(const std::wstring& s);

napi_value Undefined(napi_env env);
napi_value Null(napi_env env);
napi_value Str(napi_env env, const std::string& s);
napi_value Bool(napi_env env, bool b);

// Reads argument i of the call. False (and a pending TypeError) when it is missing or the wrong type.
bool ArgString(napi_env env, napi_value v, std::string* out);
bool ArgPid(napi_env env, napi_value v, uint32_t* out);

// Throws an Error whose `code` is set (JS reads e.code).
void ThrowCode(napi_env env, const char* code, const std::string& message);
napi_value MakeError(napi_env env, const char* code, const std::string& message);

// winrt::init_apartment(multi_threaded) once per thread; a thread already in an apartment (Electron's STA) is left alone.
void EnsureApartment();

void Export(napi_env env, napi_value exports, const char* name, napi_callback fn);

void InitJobObject(napi_env env, napi_value exports);
void InitSpeech(napi_env env, napi_value exports);
void InitNetCost(napi_env env, napi_value exports);
void InitToastHistory(napi_env env, napi_value exports);
void InitToastSetting(napi_env env, napi_value exports);
void InitTextScale(napi_env env, napi_value exports);
void InitKeyboard(napi_env env, napi_value exports);
void InitFocus(napi_env env, napi_value exports);

}  // namespace foo
