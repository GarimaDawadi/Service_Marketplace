import { View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuthGuard from "../src/auth/AuthGuard";
import Navbar from "../src/components/Navbar";
import { BACKGROUND } from "../src/theme/colors";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthGuard>
        <View style={{ flex: 1, backgroundColor: BACKGROUND }}>
          <View style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
          </View>
          <Navbar />
        </View>
      </AuthGuard>
    </SafeAreaProvider>
  );
}
