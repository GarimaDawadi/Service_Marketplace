import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import ScreenShell from "../../components/ScreenShell";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function BookingsListScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setBookings(await bookingsApi.listBookings()); }
    catch (err) { setError(getApiErrorMessage(err, "Could not load bookings.")); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <ScreenShell step="Your account" title="My bookings" subtitle="Follow requests, counter-offers, verified payments, work delivery, and reviews.">
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} tintColor={PRIMARY} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        {loading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 30 }} /> : error ? (
          <View style={styles.empty}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={() => void load()}><Text style={styles.link}>Try again</Text></TouchableOpacity></View>
        ) : bookings.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>You have no bookings yet. Explore services to send a request.</Text><TouchableOpacity onPress={() => router.replace("/search")}><Text style={styles.link}>Browse services</Text></TouchableOpacity></View>
        ) : bookings.map((booking) => (
          <TouchableOpacity key={booking.id} style={styles.card} onPress={() => router.push(`/bookings/${booking.id}` as never)}>
            <View style={styles.top}><Text style={styles.title}>{booking.title || booking.service_title || `Booking #${booking.id}`}</Text><Text style={styles.badge}>{booking.status.replace(/_/g, " ")}</Text></View>
            <Text style={styles.meta}>{booking.freelancer_name || "Service provider"} · Rs {Number(booking.agreed_price || booking.proposed_price || 0).toFixed(2)}</Text>
            {booking.appointment_start ? <Text style={styles.meta}>{new Date(booking.appointment_start).toLocaleString()}</Text> : null}
            <Text style={styles.link}>Manage booking →</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 15, marginBottom: 10 },
  top: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" },
  title: { flex: 1, color: TEXT, fontWeight: "800", fontSize: 15 },
  badge: { backgroundColor: TAG_BG, color: PRIMARY, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  meta: { color: TEXT_MUTED, fontSize: 12, marginTop: 6 },
  link: { color: PRIMARY, fontWeight: "800", marginTop: 12 },
  empty: { backgroundColor: CARD, borderRadius: 10, padding: 18, borderWidth: 1, borderColor: BORDER, marginTop: 12 },
  emptyText: { color: TEXT_MUTED, lineHeight: 20 },
  error: { color: "#B91C1C", marginBottom: 8 },
});
