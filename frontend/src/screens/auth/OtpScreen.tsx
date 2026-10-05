import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { authApi } from "../../services/api/authApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getAuth, setAuth, getPostLoginRoute, logout } from "../../auth/auth";
import { getItem, StorageKeys } from "../../utils/storage";
import { BORDER, CARD, PRIMARY, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function OtpScreen() {
  const router = useRouter();
  const { debugOtp } = useLocalSearchParams<{ debugOtp?: string }>();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string }>({
    visible: false, type: "info", title: "", message: "",
  });

  useEffect(() => {
    if (debugOtp) setCode(String(debugOtp));
    getAuth().then((auth) => {
      if (!auth.token) router.replace("/login");
      setEmail(auth.email ?? "your email");
    });
  }, [debugOtp, router]);

  const show = (type: FeedbackType, title: string, message: string) => setPopup({ visible: true, type, title, message });

  const verify = async () => {
    const auth = await getAuth();
    if (!auth.token) {
      router.replace("/login");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      show("error", "Invalid code", "Enter the six-digit verification code.");
      return;
    }
    setVerifying(true);
    try {
      const response = await authApi.verifyOtp(auth.token, code.trim());
      const user = response.data.user;
      await setAuth({
        access: response.data.access,
        refresh: response.data.refresh,
        role: user.role,
        username: user.username,
        email: user.email,
      });
      router.replace(await getPostLoginRoute(user.role));
    } catch (error) {
      show("error", "Verification failed", getApiErrorMessage(error, "That code is invalid or expired."));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    const token = await getItem(StorageKeys.TOKEN);
    if (!token) {
      router.replace("/login");
      return;
    }
    setResending(true);
    try {
      const response = await authApi.requestOtp(token);
      if (__DEV__ && response.data.debug_otp) setCode(response.data.debug_otp);
      show("success", "Code sent", __DEV__ && response.data.debug_otp
        ? `Development code: ${response.data.debug_otp}`
        : `A new code was sent to ${email}.`);
    } catch (error) {
      show("error", "Could not resend", getApiErrorMessage(error, "Please try again."));
    } finally {
      setResending(false);
    }
  };

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <ScreenShell step="Account verification" title="Enter your email code" subtitle={`We sent a six-digit code to ${email}. Verify it to continue to the correct customer or provider dashboard.`}>
      <View style={styles.card}>
        <Text style={styles.label}>Verification code</Text>
        <TextInput
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={TEXT_MUTED}
          style={styles.input}
        />
        <TouchableOpacity style={styles.primary} onPress={verify} disabled={verifying || resending}>
          {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify and continue</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={resend} disabled={resending || verifying}>
          {resending ? <ActivityIndicator color={PRIMARY} /> : <Text style={styles.linkText}>Resend code</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={signOut}>
          <Text style={styles.signOutText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={() => setPopup((value) => ({ ...value, visible: false }))}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 18 },
  label: { color: TEXT, fontWeight: "700", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, color: TEXT, letterSpacing: 8, textAlign: "center" },
  primary: { backgroundColor: PRIMARY, padding: 15, borderRadius: 10, alignItems: "center", marginTop: 14 },
  primaryText: { color: "#fff", fontWeight: "800" },
  link: { alignItems: "center", padding: 12, minHeight: 42 },
  linkText: { color: PRIMARY, fontWeight: "700" },
  signOutText: { color: TEXT_MUTED, fontWeight: "600" },
});
