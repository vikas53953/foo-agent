// Spec: 09 §9.14.2 (foo reads HKCU\Software\Microsoft\Accessibility\TextScaleFactor, DWORD 100–225, missing = 100, at
// launch and whenever it changes: `watchTextScale` watches the key with RegNotifyChangeKeyValue), 08-5 §6
// (`textScaleFactor(): number` = the DWORD / 100; fallback 1). The watcher runs on its own thread and calls back on the
// JS thread through a thread-safe function that never keeps the process alive.
#include <windows.h>

#include <thread>

#include "common.h"

namespace {

constexpr const wchar_t* kKey = L"Software\\Microsoft\\Accessibility";
constexpr const wchar_t* kValue = L"TextScaleFactor";

DWORD ReadPercent() {
  DWORD v = 100;
  DWORD size = sizeof(v);
  if (RegGetValueW(HKEY_CURRENT_USER, kKey, kValue, RRF_RT_REG_DWORD, nullptr, &v, &size) != ERROR_SUCCESS) return 100;
  if (v < 100) return 100;
  if (v > 225) return 225;
  return v;
}

napi_value TextScaleFactor(napi_env env, napi_callback_info) {
  napi_value v;
  napi_create_double(env, ReadPercent() / 100.0, &v);
  return v;
}

void CallJs(napi_env env, napi_value cb, void*, void* data) {
  auto* factor = static_cast<double*>(data);
  if (env != nullptr && cb != nullptr) {
    napi_value arg;
    napi_create_double(env, *factor, &arg);
    napi_call_function(env, foo::Undefined(env), cb, 1, &arg, nullptr);
  }
  delete factor;
}

void Watch(napi_threadsafe_function tsfn) {
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, kKey, 0, KEY_NOTIFY | KEY_QUERY_VALUE, &key) != ERROR_SUCCESS) {
    napi_release_threadsafe_function(tsfn, napi_tsfn_release);
    return;
  }
  HANDLE changed = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  DWORD last = ReadPercent();
  while (changed != nullptr) {
    if (RegNotifyChangeKeyValue(key, FALSE, REG_NOTIFY_CHANGE_LAST_SET, changed, TRUE) != ERROR_SUCCESS) break;
    if (WaitForSingleObject(changed, INFINITE) != WAIT_OBJECT_0) break;
    DWORD now = ReadPercent();
    if (now == last) continue;
    last = now;
    auto* factor = new double(now / 100.0);
    if (napi_call_threadsafe_function(tsfn, factor, napi_tsfn_blocking) != napi_ok) {
      delete factor;
      break;  // napi_closing: the JS side is going away
    }
  }
  if (changed != nullptr) CloseHandle(changed);
  RegCloseKey(key);
  napi_release_threadsafe_function(tsfn, napi_tsfn_release);
}

napi_value WatchTextScale(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_valuetype t = napi_undefined;
  if (argv[0] == nullptr || napi_typeof(env, argv[0], &t) != napi_ok || t != napi_function) {
    napi_throw_type_error(env, nullptr, "expected a callback");
    return nullptr;
  }
  napi_threadsafe_function tsfn = nullptr;
  napi_value name = foo::Str(env, "foo-native.watchTextScale");
  if (napi_create_threadsafe_function(env, argv[0], nullptr, name, 0, 1, nullptr, nullptr, nullptr, CallJs, &tsfn) != napi_ok) {
    return foo::Undefined(env);
  }
  napi_unref_threadsafe_function(env, tsfn);
  std::thread(Watch, tsfn).detach();
  return foo::Undefined(env);
}

}  // namespace

namespace foo {

void InitTextScale(napi_env env, napi_value exports) {
  Export(env, exports, "textScaleFactor", TextScaleFactor);
  Export(env, exports, "watchTextScale", WatchTextScale);
}

}  // namespace foo
