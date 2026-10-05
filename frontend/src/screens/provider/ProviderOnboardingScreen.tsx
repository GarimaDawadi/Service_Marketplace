import React, { useState } from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { userApi } from "../../services/api/userApi";
import { getApiErrorMessage } from "../../services/api/client";
import { StorageKeys, setItem } from "../../utils/storage";
import { sharedStyles } from "../../theme/sharedStyles";

export default function ProviderOnboardingScreen() {
  const router = useRouter();
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string; onConfirm?: () => void }>({
    visible: false, type: "info", title: "", message: "",
  });

  const submit = async () => {
    if (!professionalTitle.trim() || !phone.trim() || !location.trim()) {
      setPopup({ visible: true, type: "error", title: "Missing fields", message: "Enter your professional title, phone, and location." });
      return;
    }
    setLoading(true);
    try {
      const user = await userApi.updateProfile({ professional_title: professionalTitle.trim(), phone: phone.trim(), location: location.trim() });
      const profile = user.profile as { profile_completed?: boolean; kyc_status?: string } | undefined;
      await Promise.all([
        setItem(StorageKeys.PROFILE_COMPLETED, profile?.profile_completed ? "true" : "false"),
        setItem(StorageKeys.KYC_STATUS, profile?.kyc_status || "NOT_SUBMITTED"),
      ]);
      setPopup({ visible: true, type: "success", title: "Profile saved", message: "Your provider profile is ready. Submit identity documents to begin verification.", onConfirm: () => router.replace("/provider-kyc") });
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Save failed", message: getApiErrorMessage(error, "Could not save your profile.") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell step="Provider setup" title="Tell customers about your work" subtitle="These details appear on your professional profile. You can still access your dashboard while KYC is pending.">
      <TextInput placeholder="Professional title (e.g. Licensed plumber)" value={professionalTitle} onChangeText={setProfessionalTitle} style={sharedStyles.input} />
      <TextInput placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={sharedStyles.input} />
      <TextInput placeholder="Location / city" value={location} onChangeText={setLocation} style={sharedStyles.input} />
      <TouchableOpacity onPress={() => void submit()} disabled={loading} style={[sharedStyles.btnPrimary, loading && { opacity: 0.65 }]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={sharedStyles.btnPrimaryText}>Save profile and continue to KYC</Text>}
      </TouchableOpacity>
      <FeedbackModal visible={popup.visible} type={popup.type} title={popup.title} message={popup.message} onClose={() => { const callback = popup.onConfirm; setPopup((value) => ({ ...value, visible: false, onConfirm: undefined })); callback?.(); }} confirmLabel={popup.type === "success" ? "Continue" : "OK"} />
    </ScreenShell>
  );
}
