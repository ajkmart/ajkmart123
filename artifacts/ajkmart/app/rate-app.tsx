import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as StoreReview from "expo-store-review";
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import React, { useState, useMemo } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors, { spacing, radii, shadows } from "@/constants/colors";
import { Font } from "@/constants/typography";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useSmartBack } from "@/hooks/useSmartBack";

import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
const PLAY_STORE_URL = "https://play.google.com/store/apps";
const APP_STORE_URL = "https://apps.apple.com";

const ASPECTS = [
  { id: "delivery", label: "Delivery Speed", icon: "bicycle-outline" },
  { id: "prices", label: "Prices & Deals", icon: "pricetag-outline" },
  { id: "ui", label: "App Experience", icon: "phone-portrait-outline" },
  { id: "support", label: T("navCustomerSupport"), icon: "headset-outline" },
  { id: "variety", label: "Product Variety", icon: "grid-outline" },
];

export default withErrorBoundary(RateAppScreenInner);

function RateAppScreenInner() {
  
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const { showToast } = useToast();
  const { config: platformConfig } = usePlatformConfig();

  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [selectedAspects, setSelectedAspects] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const handleRateOnStore = async () => {
    try {
      const available = await StoreReview.isAvailableAsync();
      if (available && Platform.OS !== "web") {
        await StoreReview.requestReview();
        return;
      }
    // eslint-disable-next-line ajk-local/no-silent-catch -- StoreReview unavailable on this platform; falls through to URL open
    } catch {}
    const url = Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
    const ok = await Linking.canOpenURL(url).catch(() => false);
    if (ok) {
      Linking.openURL(url).catch(() =>
        showToast("Could not open app store", "error"),
      );
    } else {
      showToast("Thank you for your rating!", "success");
    }
  };

  const toggleAspect = (id: string) => {
    setSelectedAspects((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    if (rating === 0) {
      showToast("Please select a star rating", "error");
      return;
    }
    if (rating >= 4) {
      handleRateOnStore();
    }
    setSubmitted(true);
  };

  const appName = platformConfig.platform.appName || T("appName");

  if (submitted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rate the App</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.thankYouWrap}>
          <LinearGradient
            colors={[C.primarySoft, C.infoSoft]}
            style={styles.thankYouCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.thankYouIconWrap}>
              <Ionicons name="heart" size={52} color={C.primary} />
            </View>
            <Text style={styles.thankYouTitle}>Thank You!</Text>
            <Text style={styles.thankYouSub}>
              {rating >= 4
                ? `Your support means the world to us. We're glad you love ${appName}!`
                : `Your feedback helps us improve ${appName}. We'll work hard to make your experience better!`}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Ionicons
                  key={i}
                  name={i <= rating ? "star" : "star-outline"}
                  size={28}
                  color={C.gold}
                />
              ))}
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={goBack}
              style={styles.doneBtn}
            >
              <Text style={styles.doneBtnTxt}>Done</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rate the App</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <LinearGradient
          colors={["#0047B3", "#0066FF"]}
          style={styles.heroBanner}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroIconWrap}>
            <Ionicons name="storefront" size={48} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{appName}</Text>
          <Text style={styles.heroSub}>
            How would you rate your experience?
          </Text>
        </LinearGradient>

        <View style={styles.ratingCard}>
          <Text style={styles.sectionTitle}>Your Rating</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                onPress={() => setRating(i)}
                style={styles.starBtn}
                accessibilityRole="button"
                accessibilityLabel={`${i} star${i > 1 ? "s" : ""}`}
              >
                <Ionicons
                  name={i <= rating ? "star" : "star-outline"}
                  size={42}
                  color={i <= rating ? C.gold : C.border}
                />
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingLabel}>
              {rating === 1
                ? "Poor"
                : rating === 2
                  ? T("passwordFair")
                  : rating === 3
                    ? T("passwordGood")
                    : rating === 4
                      ? "Great"
                      : T("ratingExcellent")}
            </Text>
          )}
        </View>

        {rating > 0 && (
          <>
            <View style={styles.aspectsCard}>
              <Text style={styles.sectionTitle}>
                What did you like? (optional)
              </Text>
              <View style={styles.aspectsGrid}>
                {ASPECTS.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    activeOpacity={0.7}
                    onPress={() => toggleAspect(a.id)}
                    style={[
                      styles.aspectChip,
                      selectedAspects.includes(a.id) && styles.aspectChipActive,
                    ]}
                  >
                    <Ionicons
                      name={a.icon as any}
                      size={14}
                      color={
                        selectedAspects.includes(a.id)
                          ? "#fff"
                          : C.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.aspectTxt,
                        selectedAspects.includes(a.id) &&
                          styles.aspectTxtActive,
                      ]}
                    >
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.feedbackCard}>
              <Text style={styles.sectionTitle}>Tell us more (optional)</Text>
              <TextInput
                style={styles.feedbackInput}
                value={feedback}
                onChangeText={setFeedback}
                placeholder={
                  rating >= 4 ? "What do you love most?" : "How can we improve?"
                }
                placeholderTextColor={C.textMuted}
                multiline
                numberOfLines={4}
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{feedback.length}/500</Text>
            </View>
          </>
        )}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleSubmit}
          disabled={rating === 0}
          style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
        >
          <Ionicons name="star" size={18} color="#fff" />
          <Text style={styles.submitBtnTxt}>
            {rating >= 4
              ? "Submit & Rate on Store"
              : rating > 0
                ? "Submit Feedback"
                : "Select a Rating First"}
          </Text>
        </TouchableOpacity>

        {rating >= 4 && (
          <View style={styles.storeHint}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={C.textMuted}
            />
            <Text style={styles.storeHintTxt}>
              This will open the app store where you can leave a review.
            </Text>
          </View>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(C: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.borderLight,
      ...shadows.sm,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: radii.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.surfaceSecondary,
    },
    headerTitle: { flex: 1, fontFamily: Font.bold, fontSize: 16, color: C.text },
    scroll: { paddingBottom: 24 },
    heroBanner: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 36,
      paddingHorizontal: 24,
      gap: 12,
    },
    heroIconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    heroTitle: { fontFamily: Font.bold, fontSize: 24, color: "#fff" },
    heroSub: {
      fontFamily: Font.regular,
      fontSize: 14,
      color: "rgba(255,255,255,0.85)",
      textAlign: "center",
    },
    ratingCard: {
      backgroundColor: C.surface,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      borderRadius: radii.xl,
      padding: 20,
      ...shadows.sm,
      borderWidth: 1,
      borderColor: C.borderLight,
      alignItems: "center",
    },
    sectionTitle: {
      fontFamily: Font.bold,
      fontSize: 15,
      color: C.text,
      marginBottom: 16,
      alignSelf: "flex-start",
    },
    starsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    starBtn: { padding: 4 },
    ratingLabel: { fontFamily: Font.bold, fontSize: 16, color: C.gold },
    aspectsCard: {
      backgroundColor: C.surface,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: radii.xl,
      padding: 20,
      ...shadows.sm,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    aspectsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    aspectChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.full,
      backgroundColor: C.surfaceSecondary,
      borderWidth: 1,
      borderColor: C.border,
    },
    aspectChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    aspectTxt: { fontFamily: Font.medium, fontSize: 12, color: C.textSecondary },
    aspectTxtActive: { color: "#fff" },
    feedbackCard: {
      backgroundColor: C.surface,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: radii.xl,
      padding: 20,
      ...shadows.sm,
      borderWidth: 1,
      borderColor: C.borderLight,
    },
    feedbackInput: {
      fontFamily: Font.regular,
      fontSize: 14,
      color: C.text,
      backgroundColor: C.surfaceSecondary,
      borderRadius: radii.xl,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: C.border,
      minHeight: 100,
    },
    charCount: {
      fontFamily: Font.regular,
      fontSize: 11,
      color: C.textMuted,
      textAlign: "right",
      marginTop: 6,
    },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      backgroundColor: C.primary,
      borderRadius: radii.xl,
      paddingVertical: 16,
      justifyContent: "center",
    },
    submitBtnDisabled: { backgroundColor: C.border },
    submitBtnTxt: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
    storeHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      paddingHorizontal: 10,
    },
    storeHintTxt: {
      fontFamily: Font.regular,
      fontSize: 12,
      color: C.textMuted,
      flex: 1,
      lineHeight: 18,
    },
    thankYouWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    thankYouCard: {
      borderRadius: radii.xl,
      padding: 32,
      alignItems: "center",
      gap: 12,
      width: "100%",
      ...shadows.lg,
    },
    thankYouIconWrap: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: "rgba(255,255,255,0.4)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    thankYouTitle: { fontFamily: Font.bold, fontSize: 28, color: C.text },
    thankYouSub: {
      fontFamily: Font.regular,
      fontSize: 14,
      color: C.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    doneBtn: {
      backgroundColor: C.primary,
      paddingHorizontal: 40,
      paddingVertical: 14,
      borderRadius: radii.xl,
      marginTop: 12,
    },
    doneBtnTxt: { fontFamily: Font.bold, fontSize: 15, color: "#fff" },
  });
}
