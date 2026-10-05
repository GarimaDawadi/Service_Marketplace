import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { kycApi, type KycSubmission, type ProviderProfile } from "../../services/api/kycApi";
import { getApiErrorMessage } from "../../services/api/client";
import { StorageKeys, setItem } from "../../utils/storage";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

const DOCUMENT_TYPES = ["National ID", "Passport", "Driving license", "Professional license"];
type PickedFile = { uri: string; name: string; type: string };

export default function ProviderKycScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [submission, setSubmission] = useState<KycSubmission | null>(null);
  const [legalName, setLegalName] = useState("");
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [documentNumber, setDocumentNumber] = useState("");
  const [front, setFront] = useState<PickedFile | null>(null);
  const [back, setBack] = useState<PickedFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string; onConfirm?: () => void }>({ visible: false, type: "info", title: "", message: "" });
  const status = (profile?.kyc_status || submission?.status || "NOT_SUBMITTED").toUpperCase();
  const approved = status === "APPROVED";
  const pending = status === "PENDING";

  const load = async () => {
    try {
      const [currentProfile, currentSubmission] = await Promise.all([kycApi.getProfile(), kycApi.latestSubmission()]);
      setProfile(currentProfile);
      setSubmission(currentSubmission);
      setLegalName(currentSubmission?.legal_name || "");
      setDocumentType(currentSubmission?.document_type || DOCUMENT_TYPES[0]);
      setDocumentNumber(currentSubmission?.document_number || "");
      await setItem(StorageKeys.KYC_STATUS, currentProfile.kyc_status);
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Could not load verification", message: getApiErrorMessage(error, "Check your connection and try again.") });
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const pick = async (side: "front" | "back") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const file = { uri: asset.uri, name: asset.name, type: asset.mimeType || (asset.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg") };
      if (side === "front") setFront(file); else setBack(file);
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "File selection failed", message: getApiErrorMessage(error, "Could not read this file.") });
    }
  };

  const submit = async () => {
    if (!legalName.trim() || !documentNumber.trim() || !front) {
      setPopup({ visible: true, type: "error", title: "Documents required", message: "Enter your legal name and document number, and attach the front of your identity document." });
      return;
    }
    const form = new FormData();
    form.append("legal_name", legalName.trim());
    form.append("document_type", documentType);
    form.append("document_number", documentNumber.trim());
    form.append("document_front", front as unknown as Blob);
    if (back) form.append("document_back", back as unknown as Blob);
    setLoading(true);
    try {
      const saved = await kycApi.submitKyc(form);
      setSubmission(saved);
      const updatedProfile = await kycApi.getProfile();
      setProfile(updatedProfile);
      await setItem(StorageKeys.KYC_STATUS, updatedProfile.kyc_status);
      setPopup({ visible: true, type: "success", title: "Verification submitted", message: "Your identity documents are waiting for admin review.", onConfirm: () => router.replace("/provider-home") });
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Submission failed", message: getApiErrorMessage(error, "Could not submit your documents.") });
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <View style={styles.center}><ActivityIndicator color={PRIMARY} /></View>;

  return (
    <ScreenShell step="Identity verification" title="Provider KYC" subtitle="Your documents are sent securely for admin review. Publishing services remains disabled until approval.">
      <View style={styles.statusCard}>
        <Text style={styles.label}>Current status</Text>
        <Text style={[styles.status, approved && styles.approved, status === "REJECTED" && styles.rejected]}>{status.replace(/_/g, " ")}</Text>
        {status === "PENDING" ? <Text style={styles.hint}>Your documents are under review. You can continue using the provider dashboard.</Text> : null}
        {status === "REJECTED" && profile?.rejection_reason ? <Text style={styles.rejectionReason}>Admin feedback: {profile.rejection_reason}</Text> : null}
        {approved ? <Text style={styles.hint}>Identity approved. You can publish services from your provider dashboard.</Text> : null}
      </View>

      {!approved && !pending ? (
        <View style={styles.form}>
          <Text style={styles.label}>Legal name</Text>
          <TextInput value={legalName} onChangeText={setLegalName} placeholder="Name as shown on document" style={styles.input} />
          <Text style={styles.label}>Document type</Text>
          <View style={styles.row}>
            {DOCUMENT_TYPES.map((type) => <TouchableOpacity key={type} onPress={() => setDocumentType(type)} style={[styles.chip, documentType === type && styles.selectedChip]}><Text style={[styles.chipText, documentType === type && styles.selectedChipText]}>{type}</Text></TouchableOpacity>)}
          </View>
          <Text style={styles.label}>Document number</Text>
          <TextInput value={documentNumber} onChangeText={setDocumentNumber} autoCapitalize="characters" style={styles.input} placeholder="Document number" />
          <Text style={styles.label}>Front of document *</Text>
          <TouchableOpacity style={styles.fileButton} onPress={() => void pick("front")}><Text style={styles.fileText}>{front?.name || "Choose image or PDF"}</Text></TouchableOpacity>
          <Text style={styles.label}>Back of document (optional)</Text>
          <TouchableOpacity style={styles.fileButton} onPress={() => void pick("back")}><Text style={styles.fileText}>{back?.name || "Choose image or PDF"}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.submit, loading && styles.disabled]} disabled={loading} onPress={() => void submit()}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{status === "REJECTED" ? "Resubmit documents" : "Submit for review"}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
      {pending && submission ? <View style={styles.statusCard}><Text style={styles.label}>Submitted application</Text><Text style={styles.hint}>{submission.document_type} · {submission.document_number}</Text><Text style={styles.hint}>Submitted {new Date(submission.submitted_at).toLocaleDateString()}</Text></View> : null}
      <TouchableOpacity style={styles.back} onPress={() => router.replace("/provider-home")}><Text style={styles.backText}>Back to provider dashboard</Text></TouchableOpacity>
      <FeedbackModal visible={popup.visible} type={popup.type} title={popup.title} message={popup.message} onClose={() => { const callback = popup.onConfirm; setPopup((value) => ({ ...value, visible: false, onConfirm: undefined })); callback?.(); }} confirmLabel={popup.type === "success" ? "Continue" : "OK"} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: TAG_BG },
  statusCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 16, marginBottom: 16 },
  form: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 16 },
  label: { color: TEXT, fontWeight: "700", fontSize: 13, marginBottom: 7, marginTop: 8 },
  status: { color: PRIMARY, fontWeight: "900", fontSize: 19, marginBottom: 4 },
  approved: { color: "#15803D" },
  rejected: { color: "#B91C1C" },
  rejectionReason: { color: "#B91C1C", lineHeight: 20, marginTop: 8 },
  hint: { color: TEXT_MUTED, fontSize: 13, lineHeight: 19, marginTop: 4 },
  input: { backgroundColor: TAG_BG, borderColor: BORDER, borderWidth: 1, borderRadius: 8, padding: 12, color: TEXT, marginBottom: 9 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: TAG_BG },
  chipText: { color: TEXT, fontSize: 11, fontWeight: "600" },
  selectedChip: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  selectedChipText: { color: "#fff" },
  fileButton: { padding: 12, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: PRIMARY, backgroundColor: TAG_BG, marginBottom: 10 },
  fileText: { color: PRIMARY, fontWeight: "700" },
  submit: { backgroundColor: PRIMARY, borderRadius: 9, padding: 14, alignItems: "center", marginTop: 9 },
  submitText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
  back: { padding: 15, alignItems: "center" },
  backText: { color: PRIMARY, fontWeight: "700" },
});
