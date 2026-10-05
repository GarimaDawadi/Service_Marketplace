import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import ScreenShell from "../../components/ScreenShell";
import ProfileSection from "../../components/ProfileSection";
import FeedbackModal from "../../components/FeedbackModal";
import { bookingsApi, type BookingItem } from "../../services/api/bookingsApi";
import { userApi, type UserProfile } from "../../services/api/userApi";
import { getApiErrorMessage } from "../../services/api/client";
import { getViewedServices, getSearchHistory, clearActivityHistory, type ViewedService, type SearchHistoryItem } from "../../utils/activityHistory";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function CustomerDashboardScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [viewed, setViewed] = useState<ViewedService[]>([]);
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState({ visible: false, title: "", message: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const [user, customerBookings, recentViews, recentSearches] = await Promise.all([
        userApi.me(), bookingsApi.listBookings(), getViewedServices(), getSearchHistory(),
      ]);
      setProfile(user);
      setBookings(customerBookings);
      setViewed(recentViews);
      setSearches(recentSearches);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not load your dashboard."));
    } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); void load(); }, [load]));

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };
  const clearHistory = async () => {
    try { await clearActivityHistory(); setViewed([]); setSearches([]); }
    catch (err) { setPopup({ visible: true, title: "Could not clear history", message: getApiErrorMessage(err, "Try again.") }); }
  };

  return (
    <ScreenShell step="My account" title="Your dashboard" subtitle="Recent activity, searches, and booking progress.">
      <View style={styles.wrap}>
        {loading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 32 }} /> : error ? <View style={styles.panel}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={() => { setLoading(true); void load(); }}><Text style={styles.link}>Try again</Text></TouchableOpacity></View> : <>
          {profile ? <ProfileSection profile={profile} onUpdated={setProfile} /> : null}
          <Section title="Bookings">
            {bookings.length === 0 ? <Empty text="No bookings yet. Browse services to send your first request." /> : bookings.map((booking, index) => (
              <Animated.View key={booking.id} entering={FadeInDown.delay(index * 35).duration(280)}>
                <TouchableOpacity style={styles.row} onPress={() => router.push(`/bookings/${booking.id}` as never)}>
                  <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{booking.title || booking.service_title || `Booking #${booking.id}`}</Text><Text style={styles.rowMeta}>{booking.appointment_start ? formatDate(booking.appointment_start) : "No appointment date"}</Text></View>
                  <Text style={styles.badge}>{booking.status.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
            {bookings.length > 0 ? <TouchableOpacity style={styles.allBookings} onPress={() => router.push("/bookings")}><Text style={styles.link}>View all bookings →</Text></TouchableOpacity> : null}
          </Section>
          <Section title="Recently viewed">
            {viewed.length === 0 ? <Empty text="Services you open will appear here." /> : viewed.map((item) => <TouchableOpacity key={`${item.id}-${item.viewedAt}`} style={styles.row} onPress={() => router.push(`/service/${item.id}` as never)}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{item.provider_name ? `${item.provider_name} · ` : ""}{formatDate(item.viewedAt)}</Text></View><Text style={styles.link}>Open</Text></TouchableOpacity>)}
          </Section>
          <Section title="Recent searches">
            {searches.length === 0 ? <Empty text="Your recent searches will appear here." /> : searches.map((item) => <TouchableOpacity key={`${item.query}-${item.searchedAt}`} style={styles.row} onPress={() => router.push({ pathname: "/search", params: { q: item.query } } as never)}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.query}</Text><Text style={styles.rowMeta}>{formatDate(item.searchedAt)}</Text></View><Text style={styles.link}>Search</Text></TouchableOpacity>)}
          </Section>
          {(viewed.length > 0 || searches.length > 0) ? <TouchableOpacity style={styles.clear} onPress={() => void clearHistory()}><Text style={styles.clearText}>Clear local search and view history</Text></TouchableOpacity> : null}
        </>}
      </View>
      <FeedbackModal visible={popup.visible} type="error" title={popup.title} message={popup.message} onClose={() => setPopup((value) => ({ ...value, visible: false }))} />
    </ScreenShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.container}>{children}</View></View>; }
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>; }
const styles = StyleSheet.create({
  wrap: { flex: 1 }, section: { marginBottom: 18 }, sectionTitle: { color: TEXT, fontSize: 16, fontWeight: "800", marginBottom: 9 },
  container: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  rowTitle: { fontSize: 14, color: TEXT, fontWeight: "700" }, rowMeta: { fontSize: 11, color: TEXT_MUTED, marginTop: 4 }, badge: { color: PRIMARY, fontSize: 10, fontWeight: "800", backgroundColor: TAG_BG, padding: 6, borderRadius: 6, textTransform: "capitalize" },
  link: { color: PRIMARY, fontWeight: "800", fontSize: 12 }, allBookings: { padding: 13, alignItems: "flex-end" }, empty: { padding: 16 }, emptyText: { color: TEXT_MUTED, lineHeight: 19 },
  clear: { alignItems: "center", padding: 14 }, clearText: { color: TEXT_MUTED, fontWeight: "600" }, panel: { backgroundColor: CARD, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: BORDER }, error: { color: "#B91C1C", marginBottom: 8 },
});
