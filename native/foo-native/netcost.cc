// Spec: 09 §9.20.2 (metered connection: updates wait unless `networkCost()` is 'unrestricted'), 08-5 §6: the internet
// profile's ConnectionCost.NetworkCostType; no profile or an error → 'unknown' (the fallback value).
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Networking.Connectivity.h>

#include "common.h"

namespace {

using namespace winrt::Windows::Networking::Connectivity;

const char* Cost() {
  try {
    foo::EnsureApartment();
    ConnectionProfile profile = NetworkInformation::GetInternetConnectionProfile();
    if (!profile) return "unknown";
    switch (profile.GetConnectionCost().NetworkCostType()) {
      case NetworkCostType::Unrestricted:
        return "unrestricted";
      case NetworkCostType::Fixed:
        return "fixed";
      case NetworkCostType::Variable:
        return "variable";
      default:
        return "unknown";
    }
  } catch (...) {
    return "unknown";
  }
}

napi_value NetworkCost(napi_env env, napi_callback_info) {
  return foo::Str(env, Cost());
}

}  // namespace

namespace foo {

void InitNetCost(napi_env env, napi_value exports) {
  Export(env, exports, "networkCost", NetworkCost);
}

}  // namespace foo
