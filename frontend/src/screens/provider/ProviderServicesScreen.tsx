import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown } from "react-native-reanimated";
import FeedbackModal, { type FeedbackType } from "../../components/FeedbackModal";
import { getApiErrorMessage } from "../../services/api/client";
import { kycApi, type ProviderProfile } from "../../services/api/kycApi";
import { servicesApi, type CategoryItem, type ServiceItem } from "../../services/api/servicesApi";
import { SERVICE_CITIES } from "../../utils/geo";
import {
  PRIMARY,
  BACKGROUND,
  CARD,
  TEXT,
  TEXT_MUTED,
  BORDER,
  TAG_BG,
  STAR,
} from "../../theme/colors";

export default function ProviderServicesScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [checkingKyc, setCheckingKyc] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [serviceMode, setServiceMode] = useState<"REMOTE" | "LOCAL" | "BOTH">("BOTH");
  const [locationCity, setLocationCity] = useState("Kathmandu");
  const [photoUris, setPhotoUris] = useState<
    { uri: string; mimeType?: string; fileName: string; base64?: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [myServices, setMyServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState("");
  const [popup, setPopup] = useState({
    visible: false,
    type: "info" as FeedbackType,
    title: "",
    message: "",
    onConfirm: undefined as (() => void) | undefined,
  });

  useEffect(() => {
    kycApi
      .getProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setCheckingKyc(false));
  }, []);

  const loadMyServices = async () => {
    setServicesLoading(true);
    setServicesError("");
    try {
      setMyServices(await servicesApi.list({ mine: true }));
    } catch (error) {
      setMyServices([]);
      setServicesError(getApiErrorMessage(error, "Could not load your listings."));
    } finally {
      setServicesLoading(false);
    }
  };

  const loadCategories = async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const items = await servicesApi.listCategories();
      setCategories(items);
      setCategoryId((current) => current ?? items[0]?.id ?? null);
    } catch (error) {
      setCategories([]);
      setCategoriesError(getApiErrorMessage(error, "Could not load categories."));
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    void loadMyServices();
    void loadCategories();
  }, []);

  const kycStatus = (profile?.kyc_status || "NOT_SUBMITTED").toUpperCase();
  const kycVerified = Boolean(profile?.is_verified && kycStatus === "APPROVED");

  const showPopup = (
    type: FeedbackType,
    title: string,
    message: string,
    onConfirm?: () => void
  ) => setPopup({ visible: true, type, title, message, onConfirm });

  const closePopup = () => {
    const cb = popup.onConfirm;
    setPopup((p) => ({ ...p, visible: false, onConfirm: undefined }));
    cb?.();
  };

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showPopup("error", "Permission needed", "Allow photo access to upload service images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.75,
      base64: true,
    });
    if (!result.canceled && result.assets.length) {
      setPhotoUris((prev) =>
        [
          ...prev,
          ...result.assets.map((a, idx) => ({
            uri: a.uri,
            mimeType: a.mimeType ?? "image/jpeg",
            fileName: a.fileName ?? `service-${prev.length + idx}.jpg`,
            base64: a.base64,
          })),
        ].slice(0, 10)
      );
    }
  };

  const toggleServiceStatus = async (service: ServiceItem) => {
    try {
      const status = service.status === "PUBLISHED" ? "INACTIVE" : "PUBLISHED";
      await servicesApi.update(service.id, { status });
      await loadMyServices();
    } catch (error) {
      showPopup("error", "Listing update failed", getApiErrorMessage(error, "Could not update this listing."));
    }
  };

  const publish = async () => {
    if (!kycVerified) {
      showPopup(
        "info",
        "KYC pending",
        "Your identity must be verified before you can publish services. Complete KYC and wait for admin approval."
      );
      return;
    }
    if (!categoryId || !title.trim() || !description.trim() || !price.trim()) {
      showPopup("error", "Missing fields", "Choose a category and fill in title, description, and price.");
      return;
    }
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
      showPopup("error", "Invalid price", "Enter a price greater than zero.");
      return;
    }

    setLoading(true);
    try {
      const service = await servicesApi.create({
        category: categoryId,
        title: title.trim(),
        description: description.trim(),
        starting_price: Number(price).toFixed(2),
        status: "PUBLISHED",
        service_mode: serviceMode,
        location: locationCity,
      });
      const imageResults = await Promise.allSettled(photoUris.map((photo, index) =>
        servicesApi.uploadImage(service.id, photo.uri, photo.fileName || `service-${index}.jpg`, photo.mimeType || "image/jpeg")
      ));
      const failedImages = imageResults.filter((result) => result.status === "rejected").length;
      setTitle("");
      setDescription("");
      setPrice("");
      setPhotoUris([]);
      await loadMyServices();
      showPopup("success", "Service published", failedImages ? "Your service is live, but one or more images could not be uploaded." : "Your service is now active on the marketplace.");
    } catch (err) {
      showPopup("error", "Publish failed", getApiErrorMessage(err, "Could not publish service."));
    } finally {
      setLoading(false);
    }
  };

  if (checkingKyc) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  if (!kycVerified) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.kycBlock}>
          <Text style={styles.kycIcon}>⏳</Text>
          <Text style={styles.kycTitle}>{kycStatus === "REJECTED" ? "KYC requires changes" : kycStatus === "NOT_SUBMITTED" ? "Complete KYC to publish" : "KYC pending review"}</Text>
          <Text style={styles.kycBody}>
            You can only publish services after your KYC is verified by an admin.
            {kycStatus === "PENDING"
              ? " Your documents are under review."
              : kycStatus === "REJECTED"
                ? " Your KYC was rejected — review the reason and resubmit."
                : " Complete KYC submission first."}
          </Text>
          <Text style={styles.kycStatus}>Status: {kycStatus.replace(/_/g, " ")}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.push("/provider-kyc")}>
            <Text style={styles.btnText}>{kycStatus === "NOT_SUBMITTED" || kycStatus === "REJECTED" ? "Complete KYC" : "View KYC status"}</Text>
          </TouchableOpacity>
        </Animated.View>
        <FeedbackModal
          visible={popup.visible}
          type={popup.type}
          title={popup.title}
          message={popup.message}
          onClose={closePopup}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Animated.View entering={FadeInDown.springify()} style={styles.card}>
        <Text style={styles.step}>Publish a service</Text>
        <Text style={styles.title}>List on the marketplace</Text>
        <Text style={styles.sub}>Create a listing in a category. You can publish only after KYC approval.</Text>

        <Text style={styles.label}>Category</Text>
        {categoriesLoading ? <ActivityIndicator color={PRIMARY} style={{ marginVertical: 10 }} /> : categoriesError ? (
          <View><Text style={styles.formError}>{categoriesError}</Text><TouchableOpacity onPress={() => void loadCategories()}><Text style={styles.listingActionText}>Retry categories</Text></TouchableOpacity></View>
        ) : categories.length === 0 ? (
          <Text style={styles.activeEmpty}>No active service categories are available yet.</Text>
        ) : (
          <View style={styles.chips}>
            {categories.map((category) => (
              <TouchableOpacity key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.chip, categoryId === category.id && styles.chipActive]}>
                <Text style={[styles.chipText, categoryId === category.id && styles.chipTextActive]}>{category.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={styles.label}>Service mode</Text>
        <View style={styles.chips}>
          {(["REMOTE", "LOCAL", "BOTH"] as const).map((value) => (
            <TouchableOpacity key={value} onPress={() => setServiceMode(value)} style={[styles.chip, serviceMode === value && styles.chipActive]}>
              <Text style={[styles.chipText, serviceMode === value && styles.chipTextActive]}>{value === "BOTH" ? "Remote and in person" : value === "LOCAL" ? "In person" : "Remote"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Photos (optional, up to 10)</Text>
        <View style={styles.photoRow}>
          {photoUris.map((photo) => (
            <Image key={photo.uri} source={{ uri: photo.uri }} style={styles.thumb} />
          ))}
          {photoUris.length < 10 ? (
            <TouchableOpacity style={styles.addPhoto} onPress={pickPhotos}>
              <Text style={styles.addPhotoText}>+ Add</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          placeholder="Expert plumbing in Kathmandu"
          value={title}
          onChangeText={setTitle}
          style={styles.input}
        />
        <Text style={styles.label}>Description</Text>
        <TextInput
          placeholder="Describe what you offer"
          value={description}
          onChangeText={setDescription}
          multiline
          style={[styles.input, styles.multiline]}
        />
        <Text style={styles.label}>Price (Rs)</Text>
        <TextInput
          placeholder="1500"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          style={styles.input}
        />
        <Text style={styles.label}>Service area</Text>
        <View style={styles.chips}>
          {SERVICE_CITIES.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setLocationCity(c)}
              style={[styles.chip, locationCity === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, locationCity === c && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={publish} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Publish service</Text>
          )}
        </TouchableOpacity>

        <View style={styles.activeBlock}>
          <Text style={styles.activeTitle}>Your active listings</Text>
          {servicesLoading ? (
            <ActivityIndicator color={PRIMARY} style={{ marginTop: 10 }} />
          ) : servicesError ? (
            <View><Text style={styles.formError}>{servicesError}</Text><TouchableOpacity onPress={() => void loadMyServices()}><Text style={styles.listingActionText}>Retry listings</Text></TouchableOpacity></View>
          ) : myServices.length === 0 ? (
            <Text style={styles.activeEmpty}>No active listings yet.</Text>
          ) : (
            myServices.map((svc) => (
              <View key={svc.id} style={styles.activeCard}>
                <Text style={styles.activeName}>{svc.title}</Text>
                <Text style={styles.activeMeta}>
                  Rs {parseFloat(svc.price).toFixed(0)} · {svc.location || "Location not set"} · {svc.status || "DRAFT"}
                </Text>
                <TouchableOpacity style={styles.listingAction} onPress={() => void toggleServiceStatus(svc)}>
                  <Text style={styles.listingActionText}>{svc.status === "PUBLISHED" ? "Deactivate listing" : "Publish listing"}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </Animated.View>

      <FeedbackModal
        visible={popup.visible}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
        confirmLabel={popup.type === "success" ? "Done" : "OK"}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BACKGROUND },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BACKGROUND },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  kycBlock: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 28,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  kycIcon: { fontSize: 40, marginBottom: 12 },
  kycTitle: { fontSize: 22, fontWeight: "800", color: TEXT, marginBottom: 10 },
  kycBody: { color: TEXT_MUTED, textAlign: "center", lineHeight: 22, marginBottom: 12 },
  kycStatus: { fontSize: 13, fontWeight: "700", color: STAR, marginBottom: 20 },
  step: { fontSize: 12, color: TEXT_MUTED, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "800", color: TEXT, marginTop: 6 },
  sub: { color: TEXT_MUTED, marginBottom: 20, marginTop: 6, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600", color: TEXT, marginBottom: 6 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: TAG_BG },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TAG_BG,
  },
  addPhotoText: { color: PRIMARY, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    fontSize: 15,
    backgroundColor: TAG_BG,
    color: TEXT,
  },
  multiline: { minHeight: 96, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { color: PRIMARY, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  btn: {
    backgroundColor: PRIMARY,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    width: "100%",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  activeBlock: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 16,
  },
  activeTitle: { fontSize: 16, fontWeight: "700", color: TEXT, marginBottom: 10 },
  activeEmpty: { color: TEXT_MUTED, fontSize: 14 },
  formError: { color: "#B91C1C", fontSize: 12, marginVertical: 7 },
  activeCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 12,
    backgroundColor: TAG_BG,
    marginBottom: 8,
  },
  activeName: { fontSize: 14, fontWeight: "700", color: TEXT },
  activeMeta: { marginTop: 4, fontSize: 13, color: TEXT_MUTED },
  listingAction: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: BORDER },
  listingActionText: { color: PRIMARY, fontWeight: "700", fontSize: 12 },
});
