// Spec: 09 §9.9.5 (toasts from an earlier run are removed with WinRT ToastNotificationHistory.Remove(tag, group, aumid) /
// RemoveGroup(group, aumid) / Clear(aumid)), §9.19.2 (AUMID com.foo.desktop), 08-5 §6 (void; failures are no-ops, like
// the fallback: an unregistered AUMID simply has no history to remove).
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.UI.Notifications.h>

#include <string>

#include "common.h"

namespace {

using winrt::Windows::UI::Notifications::ToastNotificationManager;

napi_value Remove(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::string tag;
  std::string group;
  if (!foo::ArgString(env, argv[0], &tag) || !foo::ArgString(env, argv[1], &group)) return nullptr;
  try {
    foo::EnsureApartment();
    ToastNotificationManager::History().Remove(winrt::hstring(foo::Wide(tag)), winrt::hstring(foo::Wide(group)), foo::kAumid);
  } catch (...) {
  }
  return foo::Undefined(env);
}

napi_value RemoveGroup(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  std::string group;
  if (!foo::ArgString(env, argv[0], &group)) return nullptr;
  try {
    foo::EnsureApartment();
    ToastNotificationManager::History().RemoveGroup(winrt::hstring(foo::Wide(group)), foo::kAumid);
  } catch (...) {
  }
  return foo::Undefined(env);
}

napi_value Clear(napi_env env, napi_callback_info) {
  try {
    foo::EnsureApartment();
    ToastNotificationManager::History().Clear(foo::kAumid);
  } catch (...) {
  }
  return foo::Undefined(env);
}

}  // namespace

namespace foo {

void InitToastHistory(napi_env env, napi_value exports) {
  Export(env, exports, "toastRemove", Remove);
  Export(env, exports, "toastRemoveGroup", RemoveGroup);
  Export(env, exports, "toastClear", Clear);
}

}  // namespace foo
