import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { paymentsApi, type PaymentItem } from "../../services/api/paymentsApi";
import { getApiErrorMessage } from "../../services/api/client";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

export default function PaymentReturnScreen() {
  const params = useLocalSearchParams<{ paymentId?: string; bookingId?: string }>();
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const bookingId = Number(params.bookingId);

  useEffect(() => {
    const verify = async () => {
      const paymentId = Number(params.paymentId);
      if (!paymentId) { setError("The payment return did not include a payment reference."); setLoading(false); return; }
      try { setPayment(await paymentsApi.verify(paymentId)); }
      catch (err) { setError(getApiErrorMessage(err, "Could not verify payment.")); }
      finally { setLoading(false); }
    };
    void verify();
  }, [params.paymentId]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        {loading ? <ActivityIndicator size="large" color={PRIMARY} /> : <>
          <Text style={styles.title}>{payment?.status === "SUCCESS" ? "Payment verified" : "Payment not confirmed"}</Text>
          <Text style={styles.body}>{error || (payment?.status === "SUCCESS" ? "The server verified the gateway transaction. Your booking is confirmed." : `Current gateway status: ${payment?.status || "unknown"}. It is safe to retry verification from booking details.`)}</Text>
          {bookingId ? <TouchableOpacity style={styles.button} onPress={() => router.replace(`/bookings/${bookingId}` as never)}><Text style={styles.buttonText}>Return to booking</Text></TouchableOpacity> : <TouchableOpacity style={styles.button} onPress={() => router.replace("/bookings")}><Text style={styles.buttonText}>View bookings</Text></TouchableOpacity>}
        </>}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({ screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: TAG_BG }, card: { width: "100%", backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 20, alignItems: "center" }, title: { color: TEXT, fontSize: 19, fontWeight: "800", textAlign: "center" }, body: { color: TEXT_MUTED, textAlign: "center", lineHeight: 21, marginTop: 10 }, button: { backgroundColor: PRIMARY, padding: 13, borderRadius: 8, alignSelf: "stretch", alignItems: "center", marginTop: 18 }, buttonText: { color: "#fff", fontWeight: "800" } });
