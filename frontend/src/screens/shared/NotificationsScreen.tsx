import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ScreenShell from "../../components/ScreenShell";
import { notificationsApi, type NotificationItem } from "../../services/api/notificationsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setItems(await notificationsApi.list()); }
    catch (err) { setError(getApiErrorMessage(err, "Could not load notifications.")); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const markAllRead = async () => {
    setWorking(true);
    try { await notificationsApi.markAllRead(); await load(); }
    catch (err) { setError(getApiErrorMessage(err, "Could not update notifications.")); }
    finally { setWorking(false); }
  };
  const markRead = async (id: number) => {
    try { await notificationsApi.markRead(id); setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item)); }
    catch (err) { setError(getApiErrorMessage(err, "Could not mark this notification read.")); }
  };

  return (
    <ScreenShell step="Updates" title="Notifications" subtitle="Booking activity, messages, reviews, and verification updates.">
      {items.some((item) => !item.is_read) ? <TouchableOpacity disabled={working} style={styles.markAll} onPress={() => void markAllRead()}><Text style={styles.markAllText}>{working ? "Updating…" : "Mark all as read"}</Text></TouchableOpacity> : null}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={PRIMARY} />}>
        {loading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 28 }} /> : error ? <View style={styles.empty}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={() => void load()}><Text style={styles.link}>Try again</Text></TouchableOpacity></View> : items.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>You’re all caught up. New activity will appear here.</Text></View> : items.map((item) => (
          <TouchableOpacity key={item.id} style={[styles.card, !item.is_read && styles.unread]} onPress={() => !item.is_read && void markRead(item.id)}>
            <View style={styles.top}><Text style={styles.title}>{item.title}</Text>{!item.is_read ? <View style={styles.dot} /> : null}</View>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.meta}>{item.event_type.replace(/_/g, " ")} · {new Date(item.created_at).toLocaleString()}</Text>
            {!item.is_read ? <Text style={styles.link}>Tap to mark as read</Text> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  markAll: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 2 },
  markAllText: { color: PRIMARY, fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: CARD, padding: 14, borderWidth: 1, borderColor: BORDER, borderRadius: 10, marginBottom: 9 },
  unread: { borderColor: PRIMARY, backgroundColor: "#F8FAFF" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: TEXT, fontWeight: "800", fontSize: 14, flex: 1 },
  body: { color: TEXT, fontSize: 13, lineHeight: 19, marginTop: 6 },
  meta: { color: TEXT_MUTED, fontSize: 10, marginTop: 8, textTransform: "capitalize" },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: PRIMARY, marginLeft: 8 },
  link: { color: PRIMARY, fontSize: 11, fontWeight: "700", marginTop: 8 },
  empty: { backgroundColor: CARD, padding: 16, borderWidth: 1, borderColor: BORDER, borderRadius: 10, marginTop: 10 },
  emptyText: { color: TEXT_MUTED, lineHeight: 20 },
  error: { color: "#B91C1C", marginBottom: 8 },
});
