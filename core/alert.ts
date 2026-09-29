/**
 * core/alert.ts
 *
 * React Native's Alert.alert does nothing on web, so validation errors
 * would silently vanish in the browser preview. This uses the native
 * alert on Android/iOS and window.alert on web.
 */
import { Alert, Platform } from "react-native";

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === "web") {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
