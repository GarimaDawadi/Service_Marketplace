import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ProviderAvailability } from "../services/api/servicesApi";
import { BORDER, CARD, PRIMARY, SUCCESS, TEXT, TEXT_MUTED } from "../theme/colors";

type AvailabilitySlot = ProviderAvailability & { date: string; status: "available" | "blocked" };
type Props = {
  month: Date;
  slots: ProviderAvailability[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onChangeMonth: (delta: number) => void;
  readOnly?: boolean;
  bookingMode?: boolean;
  selectedSlotId?: number | null;
  onToggleSlot?: (slot: AvailabilitySlot) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BookingCalendar({ month, slots, selectedDate, selectedSlotId, onSelectDate, onChangeMonth, readOnly, bookingMode, onToggleSlot }: Props) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const label = month.toLocaleString("default", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const dateSlots = useMemo(() => {
    const map: Record<string, AvailabilitySlot[]> = {};
    slots.forEach((entry) => {
      if (entry.specific_date) {
        (map[entry.specific_date] ||= []).push({ ...entry, date: entry.specific_date, status: entry.is_blocked ? "blocked" : "available" });
        return;
      }
      if (entry.weekday == null) return;
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
        if (weekday === entry.weekday) (map[date] ||= []).push({ ...entry, date, status: entry.is_blocked ? "blocked" : "available" });
      }
    });
    return map;
  }, [daysInMonth, monthIndex, slots, year]);
  const leadingSpaces = new Date(year, monthIndex, 1).getDay();
  const dates: (number | null)[] = [...Array.from({ length: leadingSpaces }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const selectedSlots = selectedDate ? dateSlots[selectedDate] || [] : [];
  const isAvailableDay = (day: number) => (dateSlots[`${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`] || []).some((slot) => slot.status === "available");

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}><TouchableOpacity onPress={() => onChangeMonth(-1)}><Text style={styles.nav}>‹</Text></TouchableOpacity><Text style={styles.monthLabel}>{label}</Text><TouchableOpacity onPress={() => onChangeMonth(1)}><Text style={styles.nav}>›</Text></TouchableOpacity></View>
      <View style={styles.weekRow}>{WEEKDAYS.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
      <View style={styles.grid}>{dates.map((day, index) => {
        if (day == null) return <View key={`blank-${index}`} style={styles.cell} />;
        const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const selected = selectedDate === date;
        return <TouchableOpacity key={date} style={[styles.cell, isAvailableDay(day) && styles.availableDay, selected && styles.selectedDay]} onPress={() => onSelectDate(date)}><Text style={[styles.dayNum, selected && styles.selectedText]}>{day}</Text></TouchableOpacity>;
      })}</View>
      <View style={styles.legend}><Legend color={SUCCESS} label="Available" /><Legend color="#FCA5A5" label="Blocked" /></View>
      {selectedDate ? <View style={styles.slots}><Text style={styles.slotsTitle}>Times on {selectedDate}</Text>{selectedSlots.length === 0 ? <Text style={styles.noSlots}>No provider availability for this date.</Text> : selectedSlots.map((slot, index) => {
        const selectable = slot.status === "available" && !readOnly;
        return <TouchableOpacity key={`${slot.id}-${index}`} disabled={bookingMode && !selectable} onPress={() => onToggleSlot?.(slot)} style={[styles.slotRow, slot.status === "blocked" && styles.blocked, selectedSlotId === slot.id && styles.slotSelected]}><Text style={styles.slotTime}>{slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}</Text><Text style={styles.slotStatus}>{slot.is_blocked ? "blocked" : "available"}</Text></TouchableOpacity>;
      })}</View> : null}
    </View>
  );
}
function Legend({ color, label }: { color: string; label: string }) { return <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>; }
const styles = StyleSheet.create({
  wrap: { backgroundColor: CARD, borderRadius: 10, padding: 15, borderWidth: 1, borderColor: BORDER },
  monthRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }, nav: { color: PRIMARY, fontSize: 25, paddingHorizontal: 10 }, monthLabel: { color: TEXT, fontWeight: "800", fontSize: 16 },
  weekRow: { flexDirection: "row" }, weekday: { flex: 1, textAlign: "center", color: TEXT_MUTED, fontSize: 10, fontWeight: "700" }, grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  cell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 7 }, availableDay: { backgroundColor: "#ECFDF5" }, selectedDay: { borderWidth: 2, borderColor: PRIMARY }, dayNum: { color: TEXT, fontWeight: "700" }, selectedText: { color: PRIMARY },
  legend: { flexDirection: "row", justifyContent: "center", gap: 15, marginTop: 10 }, legendItem: { flexDirection: "row", alignItems: "center" }, dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 }, legendText: { color: TEXT_MUTED, fontSize: 10 },
  slots: { marginTop: 14 }, slotsTitle: { color: TEXT, fontWeight: "800", marginBottom: 8 }, noSlots: { color: TEXT_MUTED, fontSize: 12 }, slotRow: { flexDirection: "row", justifyContent: "space-between", padding: 11, borderRadius: 8, borderWidth: 1, borderColor: BORDER, marginBottom: 7 }, blocked: { backgroundColor: "#FEF2F2" }, slotSelected: { borderColor: PRIMARY, borderWidth: 2 }, slotTime: { color: TEXT, fontWeight: "700" }, slotStatus: { color: TEXT_MUTED, textTransform: "capitalize", fontSize: 12 },
});
