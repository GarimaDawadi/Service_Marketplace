import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import ScreenShell from "../../components/ScreenShell";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { bookingsApi, type BookingItem, type CounterOffer } from "../../services/api/bookingsApi";
import { paymentsApi, type PaymentItem } from "../../services/api/paymentsApi";
import { reviewsApi } from "../../services/api/reviewsApi";
import { userApi } from "../../services/api/userApi";
import { getApiErrorMessage } from "../../services/api/client";
import { BORDER, CARD, PRIMARY, TAG_BG, TEXT, TEXT_MUTED } from "../../theme/colors";

type FileChoice = { uri: string; name: string; type: string };
const CANCELLABLE = new Set(["PENDING_PROVIDER_RESPONSE", "COUNTER_OFFER", "AGREEMENT", "PAYMENT_PENDING", "PAYMENT_FAILED"]);

function activeOffer(offers: CounterOffer[] = []) {
  return offers.find((offer) => offer.status === "ACTIVE") || null;
}

export default function BookingDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; paymentId?: string }>();
  const bookingId = Number(params.id);
  const [booking, setBooking] = useState<BookingItem | null>(null);
  const [role, setRole] = useState("");
  const [latestPayment, setLatestPayment] = useState<PaymentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [deliverableTitle, setDeliverableTitle] = useState("");
  const [deliverableNote, setDeliverableNote] = useState("");
  const [deliverableLink, setDeliverableLink] = useState("");
  const [deliveryFile, setDeliveryFile] = useState<FileChoice | null>(null);
  const [revisionMessage, setRevisionMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [popup, setPopup] = useState<{ visible: boolean; type: FeedbackType; title: string; message: string; onConfirm?: () => void }>({ visible: false, type: "info", title: "", message: "" });

  const isProvider = role.toUpperCase() === "FREELANCER" || role.toUpperCase() === "PROVIDER";
  const isClient = role.toUpperCase() === "CLIENT" || role.toUpperCase() === "CUSTOMER";
  const offer = useMemo(() => activeOffer(booking?.counter_offers), [booking?.counter_offers]);
  const status = booking?.status || "";

  const load = useCallback(async () => {
    if (!bookingId) {
      setError("This booking link is invalid.");
      setLoading(false);
      return;
    }
    setError("");
    try {
      const [current, profile, payments] = await Promise.all([
        bookingsApi.getBooking(bookingId),
        userApi.me(),
        paymentsApi.listForBooking(bookingId).catch(() => []),
      ]);
      setBooking(current);
      setRole(profile.role);
      const sorted = payments.sort((a, b) => b.id - a.id);
      setLatestPayment(sorted[0] || null);
    } catch (error) {
      setError(getApiErrorMessage(error, "Could not load booking details."));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);
  useEffect(() => { void load(); }, [load]);

  const show = (type: FeedbackType, title: string, message: string, onConfirm?: () => void) =>
    setPopup({ visible: true, type, title, message, onConfirm });

  const runBookingAction = async (action: () => Promise<BookingItem>, title: string, message: string) => {
    setWorking(true);
    try {
      const updated = await action();
      setBooking(updated);
      await load();
      show("success", title, message);
    } catch (error) {
      show("error", "Action failed", getApiErrorMessage(error, "The booking could not be updated."));
    } finally {
      setWorking(false);
    }
  };

  const makeCounterOffer = async () => {
    const amount = Number(counterAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      show("error", "Valid amount required", "Enter a counter-offer greater than zero.");
      return;
    }
    await runBookingAction(
      () => bookingsApi.counterOffer(bookingId, { amount: amount.toFixed(2), message: counterMessage.trim() }),
      "Counter-offer sent",
      "The customer has been notified and can accept or decline this offer."
    );
  };

  const chooseFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setDeliveryFile({ uri: asset.uri, name: asset.name, type: asset.mimeType || "application/octet-stream" });
    } catch (error) {
      show("error", "File selection failed", getApiErrorMessage(error, "Could not open this file."));
    }
  };

  const sendDeliverable = async () => {
    if (!deliverableTitle.trim() && !deliverableNote.trim() && !deliverableLink.trim() && !deliveryFile) {
      show("error", "Deliverable required", "Add a title, note, link, or attach a file.");
      return;
    }
    await runBookingAction(() => bookingsApi.submitDeliverable(bookingId, {
      title: deliverableTitle.trim() || "Delivery",
      note: deliverableNote.trim(),
      link_url: deliverableLink.trim(),
      file: deliveryFile || undefined,
    }), "Work submitted", "The customer has been notified that work is ready for review.");
    setDeliverableTitle(""); setDeliverableNote(""); setDeliverableLink(""); setDeliveryFile(null);
  };

  const startPayment = async () => {
    setWorking(true);
    try {
      const initiation = await paymentsApi.initiate(bookingId);
      setLatestPayment(initiation.payment);
      await WebBrowser.openBrowserAsync(initiation.checkout_url);
      const verified = await paymentsApi.verify(initiation.payment.id);
      setLatestPayment(verified);
      await load();
      if (verified.status === "SUCCESS") show("success", "Payment verified", "Payment was verified by the server. The booking is now confirmed.");
      else show("info", "Payment not confirmed yet", "The gateway has not confirmed payment. You can verify again or retry checkout.");
    } catch (error) {
      show("error", "Payment could not be started", getApiErrorMessage(error, "Try again. Payment is only considered complete after server verification."));
    } finally {
      setWorking(false);
    }
  };

  const verifyPayment = async () => {
    setWorking(true);
    try {
      let payment = latestPayment;
      if (!payment) {
        const history = await paymentsApi.listForBooking(bookingId);
        payment = history.sort((a, b) => b.id - a.id)[0] || null;
      }
      if (!payment) {
        const initiation = await paymentsApi.initiate(bookingId);
        payment = initiation.payment;
        setLatestPayment(payment);
      }
      const verified = await paymentsApi.verify(payment.id);
      setLatestPayment(verified);
      await load();
      show(verified.status === "SUCCESS" ? "success" : "info", verified.status === "SUCCESS" ? "Payment verified" : "Still pending", verified.status === "SUCCESS" ? "The booking is confirmed." : "The payment gateway has not confirmed this transaction yet.");
    } catch (error) {
      show("error", "Verification unavailable", getApiErrorMessage(error, "Could not verify payment."));
    } finally {
      setWorking(false);
    }
  };

  const submitReview = async () => {
    setWorking(true);
    try {
      await reviewsApi.create({ booking: bookingId, rating, comment: reviewComment.trim() });
      await load();
      show("success", "Review submitted", "Thank you for reviewing this provider.");
    } catch (error) {
      show("error", "Review failed", getApiErrorMessage(error, "Could not submit your review."));
    } finally {
      setWorking(false);
    }
  };

  const openDispute = async () => {
    if (!disputeReason.trim()) {
      show("error", "Reason required", "Describe the issue so the admin team can review it.");
      return;
    }
    setWorking(true);
    try {
      await reviewsApi.openDispute({ booking: bookingId, reason: disputeReason.trim() });
      setDisputeReason("");
      await load();
      show("success", "Dispute submitted", "The booking was sent for admin review.");
    } catch (error) {
      show("error", "Dispute failed", getApiErrorMessage(error, "Could not submit this dispute."));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>;
  if (error || !booking) return <ScreenShell title="Booking unavailable" subtitle={error || "This booking could not be found."}><TouchableOpacity style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>Try again</Text></TouchableOpacity></ScreenShell>;

  const canChat = !["REJECTED", "CANCELLED", "EXPIRED"].includes(status);
  const canDispute = ["CONFIRMED", "IN_PROGRESS", "DELIVERABLE_SENT", "REVISION_REQUESTED", "COMPLETED"].includes(status);

  return (
    <ScreenShell step={`Booking #${booking.id}`} title={booking.title || booking.service_title || "Booking details"} subtitle="All booking actions are checked by the server. Payment is not confirmed until the gateway verifies it.">
      <View style={styles.summary}>
        <View style={styles.summaryHeader}><Text style={styles.status}>{status.replace(/_/g, " ")}</Text><Text style={styles.type}>{booking.service_mode} · {booking.booking_type.replace(/_/g, " ")}</Text></View>
        <Info label="Service" value={booking.service_title || booking.title} />
        <Info label={isProvider ? "Customer" : "Provider"} value={isProvider ? booking.client_name || booking.client_email || "Customer" : booking.freelancer_name || "Provider"} />
        <Info label="Proposed price" value={`Rs ${Number(booking.proposed_price || 0).toFixed(2)}`} />
        {booking.agreed_price ? <Info label="Agreed price" value={`Rs ${Number(booking.agreed_price).toFixed(2)}`} /> : null}
        {booking.appointment_start ? <Info label="Appointment" value={`${new Date(booking.appointment_start).toLocaleString()}${booking.appointment_end ? ` – ${new Date(booking.appointment_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`} /> : null}
        {booking.location_city || booking.location_address ? <Info label="Location" value={[booking.location_address, booking.location_city].filter(Boolean).join(", ")} /> : null}
        {booking.requirements ? <Text style={styles.bodyText}>{booking.requirements}</Text> : null}
        {booking.rejection_reason ? <Text style={styles.rejection}>Provider response: {booking.rejection_reason}</Text> : null}
      </View>

      {booking.counter_offers?.length ? <View style={styles.panel}><Text style={styles.sectionTitle}>Offer history</Text>{booking.counter_offers.map((item) => <View key={item.id} style={styles.offer}><Text style={styles.offerAmount}>Rs {Number(item.amount).toFixed(2)} · {item.status}</Text>{item.message ? <Text style={styles.bodyText}>{item.message}</Text> : null}{item.scope ? <Text style={styles.bodyText}>Scope: {item.scope}</Text> : null}</View>)}</View> : null}

      {booking.deliverables?.length ? <View style={styles.panel}><Text style={styles.sectionTitle}>Deliverables</Text>{booking.deliverables.map((item) => <View key={item.id} style={styles.offer}><Text style={styles.offerAmount}>{item.title}</Text>{item.note || item.description ? <Text style={styles.bodyText}>{item.note || item.description}</Text> : null}{item.link_url ? <TouchableOpacity onPress={() => void Linking.openURL(item.link_url)}><Text style={styles.link}>{item.link_url}</Text></TouchableOpacity> : null}{item.file_url ? <TouchableOpacity onPress={() => void Linking.openURL(item.file_url)}><Text style={styles.link}>Open attached file</Text></TouchableOpacity> : null}</View>)}</View> : null}

      {latestPayment ? <View style={styles.panel}><Text style={styles.sectionTitle}>Payment</Text><Info label="Status" value={latestPayment.status} /><Info label="Amount" value={`Rs ${Number(latestPayment.amount).toFixed(2)}`} />{latestPayment.gateway_ref ? <Info label="Reference" value={latestPayment.gateway_ref} /> : null}</View> : null}

      {isProvider && status === "PENDING_PROVIDER_RESPONSE" ? (
        <View style={styles.panel}><Text style={styles.sectionTitle}>Respond to request</Text><TextInput value={rejectionMessage} onChangeText={setRejectionMessage} placeholder="Optional message" style={styles.input} multiline /><View style={styles.row}><ActionButton title="Accept request" disabled={working} onPress={() => void runBookingAction(() => bookingsApi.acceptBooking(bookingId), "Request accepted", "The customer can now pay the agreed amount.")} /><ActionButton title="Decline" tone="danger" disabled={working} onPress={() => void runBookingAction(() => bookingsApi.rejectBooking(bookingId, rejectionMessage.trim()), "Request declined", "The customer has been notified.")} /></View></View>
      ) : null}

      {isProvider && ["PENDING_PROVIDER_RESPONSE", "COUNTER_OFFER"].includes(status) ? (
        <View style={styles.panel}><Text style={styles.sectionTitle}>{status === "COUNTER_OFFER" ? "Make a new counter-offer" : "Counter-offer"}</Text><TextInput value={counterAmount} onChangeText={setCounterAmount} keyboardType="decimal-pad" placeholder="Your price (Rs)" style={styles.input} /><TextInput value={counterMessage} onChangeText={setCounterMessage} placeholder="Message / scope" multiline style={[styles.input, styles.multiline]} /><ActionButton title="Send counter-offer" disabled={working} onPress={() => void makeCounterOffer()} /></View>
      ) : null}

      {isClient && status === "COUNTER_OFFER" && offer ? <View style={styles.panel}><Text style={styles.sectionTitle}>Provider counter-offer</Text><Text style={styles.offerAmount}>Rs {Number(offer.amount).toFixed(2)}</Text>{offer.message ? <Text style={styles.bodyText}>{offer.message}</Text> : null}<View style={styles.row}><ActionButton title="Accept offer" disabled={working} onPress={() => void runBookingAction(() => bookingsApi.acceptCounterOffer(bookingId), "Offer accepted", "You can now proceed to payment.")} /><ActionButton title="Decline" tone="danger" disabled={working} onPress={() => void runBookingAction(() => bookingsApi.rejectCounterOffer(bookingId), "Offer declined", "The provider has been notified.")} /></View></View> : null}

      {isClient && ["AGREEMENT", "PAYMENT_FAILED"].includes(status) ? <View style={styles.panel}><Text style={styles.sectionTitle}>Payment due</Text><Text style={styles.bodyText}>The agreed amount is Rs {Number(booking.agreed_price || 0).toFixed(2)}. Continue to eSewa to pay. The server will verify the result before confirming this booking.</Text><ActionButton title={working ? "Opening secure checkout…" : "Pay securely with eSewa"} disabled={working} onPress={() => void startPayment()} /></View> : null}
      {isClient && status === "PAYMENT_PENDING" ? <View style={styles.panel}><Text style={styles.sectionTitle}>Payment pending</Text><Text style={styles.bodyText}>If you have completed payment, verify its status. Otherwise retry checkout.</Text><View style={styles.row}><ActionButton title="Verify payment" disabled={working} onPress={() => void verifyPayment()} /><ActionButton title="Open checkout" disabled={working} onPress={() => void startPayment()} /></View></View> : null}

      {isProvider && status === "CONFIRMED" ? <View style={styles.panel}><Text style={styles.sectionTitle}>Work can begin</Text><Text style={styles.bodyText}>Payment is verified. Starting work moves this booking into delivery tracking.</Text><ActionButton title="Start work" disabled={working} onPress={() => void runBookingAction(() => bookingsApi.startWork(bookingId), "Work started", "The customer has been notified.")} /></View> : null}
      {isProvider && ["IN_PROGRESS", "REVISION_REQUESTED"].includes(status) ? <View style={styles.panel}><Text style={styles.sectionTitle}>{status === "REVISION_REQUESTED" ? "Submit revised work" : "Submit deliverable"}</Text><TextInput value={deliverableTitle} onChangeText={setDeliverableTitle} placeholder="Delivery title" style={styles.input} /><TextInput value={deliverableNote} onChangeText={setDeliverableNote} placeholder="Delivery note" multiline style={[styles.input, styles.multiline]} /><TextInput value={deliverableLink} onChangeText={setDeliverableLink} placeholder="Link URL (optional)" autoCapitalize="none" style={styles.input} /><TouchableOpacity style={styles.fileButton} onPress={() => void chooseFile()}><Text style={styles.link}>{deliveryFile?.name || "Attach a file (optional)"}</Text></TouchableOpacity><ActionButton title="Send deliverable" disabled={working} onPress={() => void sendDeliverable()} /></View> : null}

      {isClient && status === "DELIVERABLE_SENT" ? <View style={styles.panel}><Text style={styles.sectionTitle}>Review delivery</Text><Text style={styles.bodyText}>Accept the work to complete the booking, or ask for a revision within the agreed revision limit ({booking.revisions_used}/{booking.revision_limit} used).</Text>{booking.revisions_used < booking.revision_limit ? <><TextInput value={revisionMessage} onChangeText={setRevisionMessage} placeholder="What should be changed?" multiline style={[styles.input, styles.multiline]} /><ActionButton title="Request revision" disabled={working} tone="secondary" onPress={() => { if (!revisionMessage.trim()) { show("error", "Message required", "Describe the changes you need."); return; } void runBookingAction(() => bookingsApi.requestRevision(bookingId, revisionMessage.trim()), "Revision requested", "The provider has been notified.").then(() => setRevisionMessage("")); }} /></> : null}<ActionButton title="Accept work and complete" disabled={working} onPress={() => void runBookingAction(() => bookingsApi.complete(bookingId), "Booking completed", "You can now leave a review.")} /></View> : null}

      {isClient && status === "COMPLETED" && booking.can_review ? <View style={styles.panel}><Text style={styles.sectionTitle}>Rate this provider</Text><View style={styles.row}>{[1, 2, 3, 4, 5].map((value) => <TouchableOpacity key={value} onPress={() => setRating(value)} style={[styles.ratingChip, rating === value && styles.ratingSelected]}><Text style={[styles.ratingText, rating === value && styles.ratingSelectedText]}>{value} ★</Text></TouchableOpacity>)}</View><TextInput value={reviewComment} onChangeText={setReviewComment} placeholder="Share your experience (optional)" multiline style={[styles.input, styles.multiline]} /><ActionButton title="Submit review" disabled={working} onPress={() => void submitReview()} /></View> : null}

      {canChat ? <ActionButton title="Open booking chat" tone="secondary" disabled={working} onPress={() => router.push({ pathname: "/chat", params: { bookingId: String(bookingId) } } as never)} /> : null}
      {canDispute ? <View style={styles.panel}><Text style={styles.sectionTitle}>Need admin help?</Text><TextInput value={disputeReason} onChangeText={setDisputeReason} placeholder="Describe the dispute" multiline style={[styles.input, styles.multiline]} /><ActionButton title="Open dispute" tone="danger" disabled={working} onPress={() => void openDispute()} /></View> : null}
      {CANCELLABLE.has(status) ? <ActionButton title="Cancel booking" tone="danger" disabled={working} onPress={() => void runBookingAction(() => bookingsApi.cancelBooking(bookingId), "Booking cancelled", "This booking was cancelled.")} /> : null}

      <FeedbackModal visible={popup.visible} type={popup.type} title={popup.title} message={popup.message} onClose={() => { const callback = popup.onConfirm; setPopup((value) => ({ ...value, visible: false, onConfirm: undefined })); callback?.(); }} confirmLabel={popup.type === "success" ? "Done" : "OK"} />
    </ScreenShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}
function ActionButton({ title, onPress, disabled, tone = "primary" }: { title: string; onPress: () => void; disabled?: boolean; tone?: "primary" | "secondary" | "danger" }) {
  const buttonStyle = tone === "danger" ? styles.dangerButton : tone === "secondary" ? styles.secondaryButton : styles.primary;
  const textStyle = tone === "danger" ? styles.dangerText : tone === "secondary" ? styles.secondaryText : styles.primaryText;
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={[buttonStyle, disabled && styles.disabled]}><Text style={textStyle}>{title}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: TAG_BG },
  summary: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 15, marginBottom: 12 },
  summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 },
  status: { color: PRIMARY, fontWeight: "900", fontSize: 14 },
  type: { color: TEXT_MUTED, fontSize: 10, textAlign: "right" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
  infoLabel: { color: TEXT_MUTED, fontSize: 12 },
  infoValue: { flex: 1, color: TEXT, fontSize: 12, fontWeight: "700", textAlign: "right" },
  bodyText: { color: TEXT, fontSize: 13, lineHeight: 20, marginTop: 8 },
  rejection: { color: "#B91C1C", marginTop: 8, lineHeight: 18 },
  panel: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 15, marginBottom: 12 },
  sectionTitle: { color: TEXT, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  offer: { borderTopWidth: 1, borderTopColor: BORDER, paddingVertical: 10 },
  offerAmount: { color: TEXT, fontWeight: "800" },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 12, color: TEXT, backgroundColor: TAG_BG, marginTop: 8, marginBottom: 6 },
  multiline: { minHeight: 78, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 7 },
  primary: { backgroundColor: PRIMARY, padding: 13, borderRadius: 8, alignItems: "center", marginTop: 8, flexGrow: 1 },
  primaryText: { color: "#fff", fontWeight: "800", textAlign: "center" },
  secondaryButton: { backgroundColor: TAG_BG, borderWidth: 1, borderColor: BORDER, padding: 13, borderRadius: 8, alignItems: "center", marginTop: 8, flexGrow: 1 },
  secondaryText: { color: PRIMARY, fontWeight: "800", textAlign: "center" },
  dangerButton: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", padding: 13, borderRadius: 8, alignItems: "center", marginTop: 8, flexGrow: 1 },
  dangerText: { color: "#B91C1C", fontWeight: "800", textAlign: "center" },
  disabled: { opacity: 0.55 },
  link: { color: PRIMARY, fontWeight: "700", marginTop: 7 },
  fileButton: { padding: 11, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: PRIMARY, marginTop: 6 },
  ratingChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 7, backgroundColor: TAG_BG, borderWidth: 1, borderColor: BORDER },
  ratingSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  ratingText: { color: TEXT, fontWeight: "700" },
  ratingSelectedText: { color: "#fff" },
});
