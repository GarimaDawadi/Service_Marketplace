import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import { logout } from "../../auth/auth";
import { BORDER, CARD, PRIMARY, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function AdminAccessScreen() {
  const router = useRouter();
  const signOut = () => Alert.alert("Sign out?", "Sign out of this account on this device?", [
    { text: "Stay", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
  ]);
  return (
    <ScreenShell step="Administrator" title="Management console" subtitle="Customer and provider activity belongs in the mobile app. Platform administration is handled separately.">
      <View style={styles.card}>
        <Text style={styles.heading}>Use Django Admin</Text>
        <Text style={styles.body}>Open the Django Admin URL for your deployment in a browser to review KYC submissions, manage categories and listings, moderate activity, and inspect platform records. Administrator tools are intentionally not exposed in the customer/provider mobile interface.</Text>
      </View>
      <TouchableOpacity onPress={signOut} style={styles.button}><Text style={styles.buttonText}>Sign out</Text></TouchableOpacity>
    </ScreenShell>
  );
}
const styles = StyleSheet.create({ card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 18 }, heading: { color: TEXT, fontWeight: "800", fontSize: 17, marginBottom: 8 }, body: { color: TEXT_MUTED, lineHeight: 22 }, button: { marginTop: 16, backgroundColor: PRIMARY, borderRadius: 8, padding: 14, alignItems: "center" }, buttonText: { color: "#fff", fontWeight: "800" } });
