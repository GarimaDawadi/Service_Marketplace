import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function ProviderBookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setBookings(await bookingsApi.listBookings());
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load bookings."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <ScreenShell step="Provider" title="Bookings" subtitle="Review customer requests, negotiate terms, deliver work, and follow each booking through completion.">
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={PRIMARY} />}>
        {loading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 30 }} /> : error ? (
          <View style={styles.empty}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => void load()}><Text style={styles.actionText}>Try again</Text></TouchableOpacity></View>
        ) : bookings.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>No booking requests yet. New customer requests will appear here.</Text></View>
        ) : bookings.map((booking) => (
          <TouchableOpacity key={booking.id} style={styles.card} onPress={() => router.push(`/bookings/${booking.id}` as never)}>
            <View style={styles.topRow}><Text style={styles.title}>{booking.title || booking.service_title || `Booking #${booking.id}`}</Text><View style={styles.badge}><Text style={styles.badgeText}>{booking.status.replace(/_/g, " ")}</Text></View></View>
            <Text style={styles.meta}>Customer: {booking.client_name || "Marketplace customer"}</Text>
            <Text style={styles.meta}>Proposed: Rs {Number(booking.proposed_price || 0).toFixed(2)}{booking.agreed_price ? ` · Agreed: Rs ${Number(booking.agreed_price).toFixed(2)}` : ""}</Text>
            {booking.appointment_start ? <Text style={styles.meta}>Appointment: {new Date(booking.appointment_start).toLocaleString()}</Text> : null}
            <Text style={styles.actionText}>Open booking details →</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 15, marginBottom: 10 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, color: TEXT, fontSize: 16, fontWeight: "800" },
  badge: { backgroundColor: TAG_BG, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { color: PRIMARY, fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  meta: { color: TEXT_MUTED, marginTop: 6, fontSize: 12 },
  actionText: { color: PRIMARY, fontWeight: "800", marginTop: 12 },
  empty: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 18, marginTop: 12 },
  emptyText: { color: TEXT_MUTED, lineHeight: 20 },
  errorText: { color: "#B91C1C", marginBottom: 8 },
});
