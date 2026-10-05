import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import ProfileSection from "../../components/ProfileSection";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { userApi, type UserProfile } from "../../services/api/userApi";
import { logout } from "../../auth/auth";
import { getApiErrorMessage } from "../../services/api/client";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string }>({ visible: false, type: "info", title: "", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = await userApi.me();
      setProfile(user);
      const data = (user.role.toUpperCase() === "FREELANCER" ? user.freelancer_profile : user.client_profile) as Record<string, unknown> | undefined;
      setDisplayName(String(data?.professional_title || data?.full_name || ""));
      setLocation(String(data?.location || ""));
      setBio(String(data?.bio || ""));
      setPhone(user.phone || "");
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Profile unavailable", message: getApiErrorMessage(error, "Could not load your profile.") });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const isProvider = profile.role.toUpperCase() === "FREELANCER";
      const updated = await userApi.updateProfile({
        ...(isProvider ? { professional_title: displayName.trim() } : { full_name: displayName.trim() }),
        location: location.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
      });
      setProfile(updated);
      setPopup({ visible: true, type: "success", title: "Profile saved", message: "Your account details have been updated." });
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Save failed", message: getApiErrorMessage(error, "Could not save your profile.") });
    } finally { setSaving(false); }
  };

  const confirmLogout = () => Alert.alert("Sign out?", "You will need to sign in again to use your account.", [
    { text: "Stay", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: async () => { await logout(); router.replace("/login"); } },
  ]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={PRIMARY} /></View>;
  if (!profile) return <ScreenShell title="Profile unavailable" subtitle="Could not load your account details."><TouchableOpacity onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>Try again</Text></TouchableOpacity></ScreenShell>;

  const isProvider = profile.role.toUpperCase() === "FREELANCER";
  return (
    <ScreenShell step="Account" title="Your profile" subtitle="Manage your profile, security, notifications, and sign-in.">
      <ProfileSection profile={profile} onUpdated={setProfile} />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile details</Text>
        <Text style={styles.label}>{isProvider ? "Professional title" : "Full name"}</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} placeholder={isProvider ? "e.g. Licensed electrician" : "Your full name"} />
        <Text style={styles.label}>Phone</Text>
        <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={styles.input} placeholder="Phone number" />
        <Text style={styles.label}>Location</Text>
        <TextInput value={location} onChangeText={setLocation} style={styles.input} placeholder="City / service area" />
        <Text style={styles.label}>About you</Text>
        <TextInput value={bio} onChangeText={setBio} multiline style={[styles.input, styles.multiline]} placeholder="A short profile introduction" />
        <TouchableOpacity style={[styles.button, saving && styles.disabled]} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save profile</Text>}</TouchableOpacity>
      </View>
      {isProvider ? <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/provider-kyc")}><Text style={styles.linkText}>Manage identity verification</Text></TouchableOpacity> : null}
      <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/notifications")}><Text style={styles.linkText}>View notifications</Text></TouchableOpacity>
      <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout}><Text style={styles.logoutText}>Sign out</Text></TouchableOpacity>
      <FeedbackModal visible={popup.visible} type={popup.type} title={popup.title} message={popup.message} onClose={() => setPopup((value) => ({ ...value, visible: false }))} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: TAG_BG },
  card: { backgroundColor: CARD, padding: 15, borderWidth: 1, borderColor: BORDER, borderRadius: 12, marginTop: 18 },
  sectionTitle: { color: TEXT, fontWeight: "800", fontSize: 16, marginBottom: 8 },
  label: { color: TEXT, fontSize: 12, fontWeight: "700", marginTop: 8, marginBottom: 5 },
  input: { color: TEXT, backgroundColor: TAG_BG, borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 11, marginBottom: 6 },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  button: { backgroundColor: PRIMARY, padding: 13, alignItems: "center", borderRadius: 8, marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
  linkButton: { padding: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 9, marginTop: 10 },
  linkText: { color: PRIMARY, fontWeight: "700", textAlign: "center" },
  logoutButton: { padding: 14, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2", borderRadius: 9, marginTop: 14, marginBottom: 20 },
  logoutText: { color: "#B91C1C", fontWeight: "800", textAlign: "center" },
});
