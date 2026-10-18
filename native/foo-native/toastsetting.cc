// Spec: 09 §9.9.7 (at launch and on window focus foo reads ToastNotifier.Setting: DisabledForApplication,
// DisabledForUser, DisabledByGroupPolicy or DisabledByManifest → banner type 6), 08-5 §6 (an error → 'enabled', the
// fallback: foo never claims Windows blocks it when it cannot tell).
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.UI.Notifications.h>

#include "common.h"

namespace {

using namespace winrt::Windows::UI::Notifications;

const char* Setting() {
  try {
    foo::EnsureApartment();
    switch (ToastNotificationManager::CreateToastNotifier(foo::kAumid).Setting()) {
      case NotificationSetting::DisabledForApplication:
        return "disabled_app";
      case NotificationSetting::DisabledForUser:
        return "disabled_user";
      case NotificationSetting::DisabledByGroupPolicy:
        return "disabled_policy";
      case NotificationSetting::DisabledByManifest:
        return "disabled_manifest";
      default:
        return "enabled";
    }
  } catch (...) {
    return "enabled";
  }
}

napi_value ToastSetting(napi_env env, napi_callback_info) {
  return foo::Str(env, Setting());
}

}  // namespace

namespace foo {

void InitToastSetting(napi_env env, napi_value exports) {
  Export(env, exports, "toastSetting", ToastSetting);
}

}  // namespace foo
