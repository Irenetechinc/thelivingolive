import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./AppNavigator";

// Lets code outside the navigator tree (e.g. the global floating recording
// widget, which renders alongside — not inside — a Stack.Screen) trigger
// navigation imperatively. Attach via <NavigationContainer ref={navigationRef}>.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<RouteName extends keyof RootStackParamList>(
  ...args: undefined extends RootStackParamList[RouteName]
    ? [screen: RouteName] | [screen: RouteName, params: RootStackParamList[RouteName]]
    : [screen: RouteName, params: RootStackParamList[RouteName]]
) {
  if (navigationRef.isReady()) {
    // @ts-expect-error — spread matches navigate's overloaded signature at runtime
    navigationRef.navigate(...args);
  }
}
