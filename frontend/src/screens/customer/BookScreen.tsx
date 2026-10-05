import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { bookingsApi } from "../../services/api/bookingsApi";
import { servicesApi, type ProviderAvailability } from "../../services/api/servicesApi";
import { getApiErrorMessage } from "../../services/api/client";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

type ScheduleChoice = ProviderAvailability & { dateLabel: string };

function isoLocal(date: string, time: string) {
  // Marketplace appointment times follow the backend's Asia/Kathmandu timezone.
  return `${date}T${time}:00+05:45`;
}
function weekdayFor(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  return (value.getUTCDay() + 6) % 7;
}

export default function BookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    serviceId?: string; title?: string; price?: string; provider?: string; providerId?: string; mode?: string; duration?: string;
  }>();
  const serviceId = Number(params.serviceId);
  const providerId = Number(params.providerId);
  const [mode, setMode] = useState<"LOCAL" | "REMOTE">("REMOTE");
  const [date, setDate] = useState("");
  const [windows, setWindows] = useState<ProviderAvailability[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<ProviderAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [requirements, setRequirements] = useState("");
  const [proposedPrice, setProposedPrice] = useState(params.price || "");
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string; onConfirm?: () => void }>({
    visible: false, type: "info", title: "", message: "",
  });

  const allowedModes = useMemo(() => {
    const serviceMode = (params.mode || "BOTH").toUpperCase();
    return serviceMode === "LOCAL" ? ["LOCAL"] : serviceMode === "REMOTE" ? ["REMOTE"] : ["REMOTE", "LOCAL"];
  }, [params.mode]);
  const choices = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [] as ScheduleChoice[];
    const specific = windows.filter((entry) => entry.specific_date === date);
    const weekday = windows.filter((entry) => entry.specific_date == null && entry.weekday === weekdayFor(date));
    return [...specific, ...weekday].map((entry) => ({ ...entry, dateLabel: date }));
  }, [date, windows]);

  useEffect(() => {
    if (allowedModes.length === 1) setMode(allowedModes[0] as "LOCAL" | "REMOTE");
  }, [allowedModes]);

  const loadAvailability = useCallback(async () => {
    if (!providerId || mode !== "LOCAL") return;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    try {
      setWindows(await servicesApi.listAvailability(providerId));
    } catch (error) {
      setWindows([]);
      setAvailabilityError(getApiErrorMessage(error, "Could not load the provider's schedule."));
    } finally {
      setAvailabilityLoading(false);
    }
  }, [mode, providerId]);

  useEffect(() => { void loadAvailability(); }, [loadAvailability]);

  const findTimes = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setPopup({ visible: true, type: "error", title: "Date required", message: "Enter a date in YYYY-MM-DD format." });
      return;
    }
    setSelectedWindow(null);
  };

  const submit = async () => {
    if (!serviceId || !providerId) {
      setPopup({ visible: true, type: "error", title: "Booking unavailable", message: "This service link is missing required details." });
      return;
    }
    const amount = Number(proposedPrice);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPopup({ visible: true, type: "error", title: "Price required", message: "Enter a valid proposed price." });
      return;
    }
    if (mode === "LOCAL" && (!selectedWindow || !locationCity.trim() && !locationAddress.trim())) {
      setPopup({ visible: true, type: "error", title: "Appointment details required", message: "Choose an available time and enter a city or service address." });
      return;
    }
    setLoading(true);
    try {
      const booking = await bookingsApi.createBooking({
        service: serviceId,
        title: params.title || "Service booking",
        booking_type: mode === "LOCAL" ? "LOCAL_APPOINTMENT" : "FIXED_SERVICE",
        service_mode: mode,
        proposed_price: amount.toFixed(2),
        requirements: requirements.trim(),
        ...(mode === "LOCAL" && selectedWindow ? {
          appointment_start: isoLocal(date, selectedWindow.start_time.slice(0, 5)),
          appointment_end: isoLocal(date, selectedWindow.end_time.slice(0, 5)),
          location_city: locationCity.trim(),
          location_address: locationAddress.trim(),
        } : {}),
      });
      setPopup({ visible: true, type: "success", title: "Request sent", message: "Your request is with the provider. You can track the negotiation and payment from booking details.", onConfirm: () => router.replace(`/bookings/${booking.id}` as never) });
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Booking failed", message: getApiErrorMessage(error, "Could not create this booking request.") });
    } finally {
      setLoading(false);
    }
  };

  if (!params.serviceId || !params.providerId) {
    return (
      <ScreenShell title="Booking unavailable" subtitle="Open a service listing and choose Book to start a request.">
        <TouchableOpacity style={styles.primary} onPress={() => router.replace("/home")}><Text style={styles.primaryText}>Browse services</Text></TouchableOpacity>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell step="New booking" title="Request this service" subtitle="Send a booking request. The provider may accept it or make a counter-offer before payment is due.">
      <View style={styles.serviceCard}>
        <Text style={styles.serviceTitle}>{params.title}</Text>
        <Text style={styles.meta}>Provider: {params.provider}</Text>
      </View>
      <Text style={styles.label}>How do you want the service?</Text>
      <View style={styles.row}>
        {allowedModes.map((value) => (
          <TouchableOpacity key={value} onPress={() => { setMode(value as "LOCAL" | "REMOTE"); setSelectedWindow(null); }} style={[styles.chip, mode === value && styles.activeChip]}>
            <Text style={[styles.chipText, mode === value && styles.activeChipText]}>{value === "LOCAL" ? "In person" : "Remote"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === "LOCAL" ? (
        <View style={styles.panel}>
          <Text style={styles.label}>Appointment date</Text>
          <View style={styles.rowInput}>
            <TextInput value={date} onChangeText={(value) => { setDate(value); setSelectedWindow(null); }} placeholder="YYYY-MM-DD" style={[styles.input, { flex: 1 }]} autoCapitalize="none" />
            <TouchableOpacity onPress={findTimes} style={styles.secondary}><Text style={styles.secondaryText}>Find times</Text></TouchableOpacity>
          </View>
          {availabilityLoading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 10 }} /> : null}
          {availabilityError ? <View style={styles.availabilityError}><Text style={styles.errorText}>{availabilityError}</Text><TouchableOpacity onPress={() => void loadAvailability()}><Text style={styles.retryText}>Retry schedule</Text></TouchableOpacity></View> : null}
          {!availabilityLoading && !availabilityError && date ? choices.length ? (
            <View style={styles.windowList}>
              <Text style={styles.hint}>Choose an available provider window:</Text>
              {choices.map((choice) => (
                <TouchableOpacity key={choice.id} onPress={() => setSelectedWindow(choice)} style={[styles.window, selectedWindow?.id === choice.id && styles.windowSelected]}>
                  <Text style={styles.windowTitle}>{choice.start_time.slice(0, 5)} – {choice.end_time.slice(0, 5)}</Text>
                  {choice.note ? <Text style={styles.meta}>{choice.note}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : <Text style={styles.hint}>No published hours match this date. Check the date or ask the provider to update availability.</Text> : null}
          <Text style={styles.label}>City or service address</Text>
          <TextInput value={locationCity} onChangeText={setLocationCity} placeholder="City" style={styles.input} />
          <TextInput value={locationAddress} onChangeText={setLocationAddress} placeholder="Street address / meeting location (optional if city entered)" style={styles.input} />
        </View>
      ) : null}

      <Text style={styles.label}>Proposed price (Rs)</Text>
      <TextInput value={proposedPrice} onChangeText={setProposedPrice} keyboardType="decimal-pad" style={styles.input} placeholder="Enter your budget" />
      <Text style={styles.label}>Requirements for the provider</Text>
      <TextInput value={requirements} onChangeText={setRequirements} multiline style={[styles.input, styles.multiline]} placeholder="Describe what you need, desired outcome, or other relevant details" />
      <TouchableOpacity disabled={loading} onPress={() => void submit()} style={[styles.primary, loading && styles.disabled]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send booking request</Text>}
      </TouchableOpacity>
      <FeedbackModal visible={popup.visible} type={popup.type} title={popup.title} message={popup.message} onClose={() => { const callback = popup.onConfirm; setPopup((value) => ({ ...value, visible: false, onConfirm: undefined })); callback?.(); }} confirmLabel={popup.type === "success" ? "View booking" : "OK"} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  serviceCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 15, marginBottom: 18 },
  serviceTitle: { color: TEXT, fontSize: 17, fontWeight: "800" },
  meta: { color: TEXT_MUTED, fontSize: 12, marginTop: 5 },
  label: { fontSize: 13, fontWeight: "700", color: TEXT, marginBottom: 8, marginTop: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  rowInput: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  activeChip: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { color: TEXT, fontWeight: "700" },
  activeChipText: { color: "#fff" },
  panel: { padding: 14, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: BORDER, backgroundColor: TAG_BG, borderRadius: 8, padding: 12, color: TEXT, marginBottom: 9 },
  multiline: { minHeight: 105, textAlignVertical: "top" },
  secondary: { paddingHorizontal: 13, paddingVertical: 13, borderRadius: 8, backgroundColor: TAG_BG, borderWidth: 1, borderColor: BORDER },
  secondaryText: { color: PRIMARY, fontWeight: "700", fontSize: 12 },
  hint: { color: TEXT_MUTED, fontSize: 12, lineHeight: 18, marginVertical: 8 },
  availabilityError: { marginVertical: 8 },
  errorText: { color: "#B91C1C", fontSize: 12, lineHeight: 18 },
  retryText: { color: PRIMARY, fontSize: 12, fontWeight: "800", marginTop: 6 },
  windowList: { marginBottom: 8 },
  window: { padding: 12, marginVertical: 4, borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: TAG_BG },
  windowSelected: { borderColor: PRIMARY, borderWidth: 2, backgroundColor: "#EFF6FF" },
  windowTitle: { color: TEXT, fontWeight: "700" },
  primary: { padding: 15, alignItems: "center", borderRadius: 9, backgroundColor: PRIMARY, marginTop: 10, marginBottom: 24 },
  primaryText: { color: "#fff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
