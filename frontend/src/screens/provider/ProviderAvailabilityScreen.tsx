import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { getApiErrorMessage } from "../../services/api/client";
import { servicesApi, type ProviderAvailability } from "../../services/api/servicesApi";
import { getAuth } from "../../auth/auth";
import { TIME_PRESETS } from "../../utils/bookingHelpers";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ProviderAvailabilityScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<ProviderAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"weekly" | "date">("weekly");
  const [weekday, setWeekday] = useState(0);
  const [date, setDate] = useState("");
  const [presetIndex, setPresetIndex] = useState(0);
  const [note, setNote] = useState("");
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string }>({
    visible: false, type: "info", title: "", message: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const auth = await getAuth();
      if (!auth.token) {
        router.replace("/login");
        return false;
      }
      const data = await servicesApi.listAvailability();
      setEntries(data);
      return true;
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "Could not load availability."));
      return false;
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (mode === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      setPopup({ visible: true, type: "error", title: "Date required", message: "Enter a date in YYYY-MM-DD format." });
      return;
    }
    const selected = TIME_PRESETS[presetIndex];
    setSaving(true);
    try {
      await servicesApi.createAvailability({
        weekday: mode === "weekly" ? weekday : null,
        specific_date: mode === "date" ? date.trim() : null,
        start_time: selected.start,
        end_time: selected.end,
        is_blocked: false,
        note: note.trim(),
      });
      setNote("");
      const refreshed = await load();
      setPopup({ visible: true, type: "success", title: "Availability added", message: refreshed ? "Customers can now request appointments during this time." : "The time was saved, but the schedule could not be refreshed. Use Retry to reload it." });
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Could not add availability", message: getApiErrorMessage(error, "Check that the times do not overlap and try again.") });
    } finally {
      setSaving(false);
    }
  };

  const toggleBlocked = async (entry: ProviderAvailability) => {
    try {
      await servicesApi.updateAvailability(entry.id, { is_blocked: !entry.is_blocked });
      await load();
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Update failed", message: getApiErrorMessage(error, "Could not update this time." ) });
    }
  };

  const remove = async (entry: ProviderAvailability) => {
    try {
      await servicesApi.deleteAvailability(entry.id);
      await load();
    } catch (error) {
      setPopup({ visible: true, type: "error", title: "Remove failed", message: getApiErrorMessage(error, "Could not remove this time." ) });
    }
  };

  return (
    <ScreenShell step="Provider calendar" title="Manage availability" subtitle="Add weekly hours or a one-time date. Customers can only request local appointments within your published hours.">
      <View style={styles.card}>
        <Text style={styles.label}>Schedule type</Text>
        <View style={styles.row}>
          {(["weekly", "date"] as const).map((value) => (
            <TouchableOpacity key={value} style={[styles.chip, mode === value && styles.activeChip]} onPress={() => setMode(value)}>
              <Text style={[styles.chipText, mode === value && styles.activeChipText]}>{value === "weekly" ? "Repeats weekly" : "Specific date"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === "weekly" ? (
          <>
            <Text style={styles.label}>Day of week</Text>
            <View style={styles.row}>
              {WEEKDAYS.map((day, index) => (
                <TouchableOpacity key={day} style={[styles.chip, weekday === index && styles.activeChip]} onPress={() => setWeekday(index)}>
                  <Text style={[styles.chipText, weekday === index && styles.activeChipText]}>{day.slice(0, 3)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput value={date} onChangeText={setDate} placeholder="2026-10-05" autoCapitalize="none" style={styles.input} />
          </>
        )}
        <Text style={styles.label}>Available hours</Text>
        <View style={styles.row}>
          {TIME_PRESETS.map((preset, index) => (
            <TouchableOpacity key={preset.label} style={[styles.chip, presetIndex === index && styles.activeChip]} onPress={() => setPresetIndex(index)}>
              <Text style={[styles.chipText, presetIndex === index && styles.activeChipText]}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="Anything customers should know" style={styles.input} />
        <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} disabled={saving} onPress={add}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Add availability</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Your schedule</Text>
      {loading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 24 }} /> : loadError ? (
        <View style={styles.empty}><Text style={styles.errorText}>{loadError}</Text><TouchableOpacity onPress={() => void load()}><Text style={styles.retryText}>Retry</Text></TouchableOpacity></View>
      ) : entries.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>No availability set yet. Add weekly hours or a specific date above.</Text></View>
      ) : entries.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryTitle}>{entry.specific_date || WEEKDAYS[entry.weekday ?? 0]}</Text>
            <Text style={styles.entryMeta}>{entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}{entry.note ? ` · ${entry.note}` : ""}</Text>
            <Text style={[styles.entryStatus, entry.is_blocked && styles.blocked]}>{entry.is_blocked ? "Blocked" : "Available"}</Text>
          </View>
          <TouchableOpacity onPress={() => void toggleBlocked(entry)} style={styles.smallAction}>
            <Text style={styles.smallActionText}>{entry.is_blocked ? "Unblock" : "Block"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void remove(entry)} style={styles.removeAction}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <FeedbackModal visible={popup.visible} type={popup.type} title={popup.title} message={popup.message} onClose={() => setPopup((current) => ({ ...current, visible: false }))} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, backgroundColor: CARD, borderColor: BORDER, borderWidth: 1, marginBottom: 24 },
  label: { color: TEXT, fontWeight: "700", fontSize: 13, marginBottom: 8, marginTop: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: TAG_BG, paddingHorizontal: 11, paddingVertical: 9 },
  activeChip: { borderColor: PRIMARY, backgroundColor: PRIMARY },
  chipText: { color: TEXT, fontWeight: "600", fontSize: 12 },
  activeChipText: { color: "#fff" },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: TAG_BG, color: TEXT, padding: 12, marginBottom: 8 },
  primaryButton: { backgroundColor: PRIMARY, padding: 14, borderRadius: 8, alignItems: "center", marginTop: 6 },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.6 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: TEXT, marginBottom: 10 },
  empty: { padding: 18, borderRadius: 10, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  emptyText: { color: TEXT_MUTED, lineHeight: 21 },
  errorText: { color: "#B91C1C", lineHeight: 21, marginBottom: 8 },
  retryText: { color: PRIMARY, fontWeight: "800" },
  entry: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, borderRadius: 10, padding: 13, marginBottom: 9 },
  entryTitle: { color: TEXT, fontWeight: "700" },
  entryMeta: { color: TEXT_MUTED, marginTop: 4, fontSize: 12 },
  entryStatus: { color: "#15803D", fontWeight: "700", fontSize: 11, marginTop: 4 },
  blocked: { color: "#B91C1C" },
  smallAction: { padding: 7 },
  smallActionText: { color: PRIMARY, fontWeight: "700", fontSize: 12 },
  removeAction: { padding: 7 },
  removeText: { color: "#B91C1C", fontWeight: "700", fontSize: 12 },
});
