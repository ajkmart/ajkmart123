import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { CartSwitchModal } from "@/components/CartSwitchModal";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import {
  useGetProduct, useGetProducts, getProductVariants, trackInteraction,
  addToWishlist, removeFromWishlist, checkWishlist,
  getProductReviews, getProductReviewSummary, submitProductReview, uploadImage,
  type Product, type ProductReview, type ReviewSummary,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const C = Colors.light;
const { width: SCREEN_W } = Dimensions.get("window");
const IMAGE_H = SCREEN_W * 0.85;

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      stars.push(<Ionicons key={i} name="star" size={size} color={C.gold} />);
    } else if (i - 0.5 <= rating) {
      stars.push(<Ionicons key={i} name="star-half" size={size} color={C.gold} />);
    } else {
      stars.push(<Ionicons key={i} name="star-outline" size={size} color={C.silverBg} />);
    }
  }
  return <View style={{ flexDirection: "row", gap: 1 }}>{stars}</View>;
}

function StarPicker({ rating, onRate, size = 32 }: { rating: number; onRate: (r: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Pressable key={i} onPress={() => onRate(i)}>
          <Ionicons name={i <= rating ? "star" : "star-outline"} size={size} color={C.gold} />
        </Pressable>
      ))}
    </View>
  );
}

function ReviewCard({ review }: { review: ProductReview }) {
  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);
  const dateStr = new Date(review.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const initial = (review.userName || "C").charAt(0).toUpperCase();

  return (
    <View style={rs.card}>
      <View style={rs.cardHeader}>
        <View style={rs.avatar}>
          <Text style={rs.avatarTxt}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rs.userName}>{review.userName}</Text>
          <Text style={rs.date}>{dateStr}</Text>
        </View>
        <StarRating rating={review.rating} size={12} />
      </View>
      {review.comment ? <Text style={rs.comment}>{review.comment}</Text> : null}
      {review.photos && review.photos.length > 0 && (
        <View style={rs.photoRow}>
          {review.photos.map((photo, i) => (
            <Pressable key={i} onPress={() => setFullScreenPhoto(photo)}>
              <Image source={{ uri: photo }} style={rs.photoThumb} />
            </Pressable>
          ))}
        </View>
      )}
      {review.vendorReply && (
        <View style={rs.vendorReplyWrap}>
          <View style={rs.vendorReplyHeader}>
            <Ionicons name="storefront-outline" size={12} color={C.primary} />
            <Text style={rs.vendorReplyLabel}>Seller Response</Text>
          </View>
          <Text style={rs.vendorReplyText}>{review.vendorReply}</Text>
        </View>
      )}
      <Modal visible={!!fullScreenPhoto} transparent animationType="fade" onRequestClose={() => setFullScreenPhoto(null)}>
        <Pressable style={rs.fullScreenOverlay} onPress={() => setFullScreenPhoto(null)}>
          <Pressable onPress={() => setFullScreenPhoto(null)} style={rs.fullScreenClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          {fullScreenPhoto && (
            <Image source={{ uri: fullScreenPhoto }} style={rs.fullScreenImg} resizeMode="contain" />
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

function WriteReviewModal({
  visible, onClose, productId, onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  productId: string;
  onSuccess: () => void;
}) {
  const { token } = useAuth();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pickPhoto = async () => {
    if (photos.length >= 3) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
    });
    if (!result.canceled && result.assets) {
      const newPhotos = result.assets
        .filter(a => a.base64)
        .map(a => ({ uri: a.uri, base64: a.base64! }));
      setPhotos(prev => [...prev, ...newPhotos].slice(0, 3));
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a star rating"); return; }
    setSubmitting(true);
    setError("");
    try {
      const photoUrls: string[] = [];
      for (const photo of photos) {
        const uploadRes = await uploadImage(photo.base64, "image/jpeg");
        if (uploadRes.url) photoUrls.push(uploadRes.url);
      }

      await submitProductReview({
        orderType: "product",
        rating,
        comment: comment.trim() || undefined,
        productId,
        photos: photoUrls.length > 0 ? photoUrls : undefined,
      });

      setRating(0);
      setComment("");
      setPhotos([]);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || "Failed to submit review");
      if (msg.includes("purchased")) {
        setError("You can only review products you have purchased.");
      } else if (msg.includes("Already reviewed")) {
        setError("You have already reviewed this product.");
      } else {
        setError(msg);
      }
    }
    setSubmitting(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={wr.overlay}>
        <View style={wr.sheet}>
          <View style={wr.handle} />
          <View style={wr.header}>
            <Text style={wr.title}>Write a Review</Text>
            <Pressable onPress={onClose} style={wr.closeBtn}>
              <Ionicons name="close" size={22} color={C.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={wr.label}>Your Rating</Text>
            <View style={wr.starRow}>
              <StarPicker rating={rating} onRate={setRating} />
            </View>

            <Text style={wr.label}>Your Review (Optional)</Text>
            <TextInput
              style={wr.textInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Share your experience with this product..."
              placeholderTextColor={C.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={wr.charCount}>{comment.length}/500</Text>

            <Text style={wr.label}>Photos (Optional, up to 3)</Text>
            <View style={wr.photoRow}>
              {photos.map((p, i) => (
                <View key={i} style={wr.photoWrap}>
                  <Image source={{ uri: p.uri }} style={wr.photoPreview} />
                  <Pressable onPress={() => removePhoto(i)} style={wr.photoRemove}>
                    <Ionicons name="close-circle" size={20} color={C.danger} />
                  </Pressable>
                </View>
              ))}
              {photos.length < 3 && (
                <Pressable onPress={pickPhoto} style={wr.addPhotoBtn}>
                  <Ionicons name="camera-outline" size={24} color={C.primary} />
                  <Text style={wr.addPhotoTxt}>Add</Text>
                </Pressable>
              )}
            </View>

            {error ? <Text style={wr.error}>{error}</Text> : null}

            <Pressable
              onPress={handleSubmit}
              disabled={submitting || rating === 0}
              style={[wr.submitBtn, (submitting || rating === 0) && wr.submitBtnDisabled]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={wr.submitBtnTxt}>Submit Review</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const SCREEN_H = Dimensions.get("window").height;

function ZoomableImage({ uri }: { uri: string }) {
  const scrollRef = useRef<ScrollView>(null);

  const handleDoubleTap = useCallback(() => {
    scrollRef.current?.scrollResponderZoomTo({
      x: 0, y: 0,
      width: SCREEN_W,
      height: SCREEN_H,
      animated: true,
    });
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ width: SCREEN_W, height: SCREEN_H }}
      contentContainerStyle={{ alignItems: "center", justifyContent: "center", minHeight: SCREEN_H }}
      maximumZoomScale={4}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      centerContent
      bouncesZoom
    >
      <Pressable onPress={handleDoubleTap}>
        <Image
          source={{ uri }}
          style={{ width: SCREEN_W, height: SCREEN_W }}
          resizeMode="contain"
        />
      </Pressable>
    </ScrollView>
  );
}

function FullScreenImageViewer({
  visible, images, initialIndex, onClose,
}: {
  visible: boolean;
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [activeIdx, setActiveIdx] = useState(initialIndex);

  useEffect(() => {
    if (visible) setActiveIdx(initialIndex);
  }, [visible, initialIndex]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.overlay}>
        <Pressable onPress={onClose} style={fs.closeBtn}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={fs.zoomHint}>Pinch to zoom</Text>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={(e) => {
            setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
          }}
          renderItem={({ item }) => (
            <ZoomableImage uri={item} />
          )}
          keyExtractor={(_, i) => String(i)}
        />
        {images.length > 1 && (
          <View style={fs.dotRow}>
            {images.map((_, i) => (
              <View key={i} style={[fs.dot, i === activeIdx && fs.dotActive]} />
            ))}
          </View>
        )}
        <Text style={fs.counter}>{activeIdx + 1} / {images.length}</Text>
      </View>
    </Modal>
  );
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Math.max(insets.bottom, Platform.OS === "web" ? 20 : 16);

  const { user, token } = useAuth();
  const isLoggedIn = !!user && !!token;
  const queryClient = useQueryClient();
  const { addItem, cartType, itemCount, clearCart } = useCart();
  const [added, setAdded] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [showWriteReview, setShowWriteReview] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  const { data: product, isLoading, isError, refetch } = useGetProduct(id || "");

  const [isInWishlist, setIsInWishlist] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn && id) {
      checkWishlist(id).then(setIsInWishlist).catch(() => {});
    }
  }, [isLoggedIn, id]);

  const toggleWishlist = useCallback(async () => {
    if (!isLoggedIn) {
      router.push("/auth");
      return;
    }
    if (!id || wishlistLoading) return;
    setWishlistLoading(true);
    const wasInWishlist = isInWishlist;
    setIsInWishlist(!wasInWishlist);
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    try {
      if (wasInWishlist) {
        await removeFromWishlist(id);
      } else {
        await addToWishlist(id);
      }
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    } catch {
      setIsInWishlist(wasInWishlist);
    }
    setWishlistLoading(false);
  }, [isLoggedIn, id, isInWishlist, wishlistLoading, queryClient]);

  const productType = product?.type || "mart";
  const { data: relatedData } = useGetProducts(
    { type: productType as import("@workspace/api-client-react").GetProductsType, category: product?.category },
    { query: { enabled: !!product, queryKey: ["related", id] } }
  );
  const relatedProducts = (relatedData?.products || [])
    .filter((p: Product) => p.id !== id)
    .sort((a: Product, b: Product) => {
      const popA = (a.reviewCount ?? 0) + (a.rating ?? 0) * 10;
      const popB = (b.reviewCount ?? 0) + (b.rating ?? 0) * 10;
      return popB - popA;
    })
    .slice(0, 4);

  const { data: variants } = useQuery({
    queryKey: ["product-variants", id],
    queryFn: () => getProductVariants(id || ""),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const { data: reviewsData, refetch: refetchReviews } = useQuery({
    queryKey: ["product-reviews", id],
    queryFn: () => getProductReviews(id || "", { limit: 5 }),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: reviewSummary, refetch: refetchSummary } = useQuery({
    queryKey: ["product-review-summary", id],
    queryFn: () => getProductReviewSummary(id || ""),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    if (id) {
      trackInteraction({ productId: id, type: "view" }).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const origPrice = Number(product?.originalPrice) || 0;
  const price = Number(product?.price) || 0;
  const discount = origPrice > 0 && origPrice > price
    ? Math.round(((origPrice - price) / origPrice) * 100)
    : 0;

  const images: string[] = [];
  if (product?.image) images.push(product.image);
  if (product?.images && Array.isArray(product.images)) {
    for (const img of product.images) {
      if (img && !images.includes(img)) images.push(img);
    }
  }

  const doAdd = useCallback(() => {
    if (!product) return;
    const type = productType === "food" ? "food" : productType === "pharmacy" ? "pharmacy" : "mart";
    const variantObj = selectedVariant ? (product.variants as Array<{id: string; price: number; label?: string}> | undefined)?.find(v => v.id === selectedVariant) ?? null : null;
    const variantPrice = variantObj ? variantObj.price : Number(product.price);
    const variantLabel = variantObj ? ` (${variantObj.label ?? variantObj.id})` : "";
    addItem({
      productId: product.id,
      name: product.name + variantLabel,
      price: variantPrice,
      quantity: 1,
      image: product.image,
      type,
    });
    setAdded(true);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => {
      setAdded(false);
      addedTimerRef.current = null;
    }, 2000);
  }, [product, productType, addItem, scale, selectedVariant]);

  const handleAdd = useCallback(() => {
    if (!product) return;
    const type = productType === "food" ? "food" : productType === "pharmacy" ? "pharmacy" : "mart";
    if (itemCount > 0 && cartType !== type && cartType !== "none") {
      setShowSwitchModal(true);
      return;
    }
    doAdd();
  }, [product, productType, itemCount, cartType, doAdd]);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, IMAGE_H - 100],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const handleReviewSuccess = () => {
    refetchReviews();
    refetchSummary();
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.floatingHeader, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <SkeletonBlock w={SCREEN_W} h={IMAGE_H} r={0} />
          <View style={{ padding: 16, gap: 12 }}>
            <SkeletonBlock w="70%" h={22} />
            <SkeletonBlock w="40%" h={16} />
            <SkeletonBlock w="50%" h={28} />
            <SkeletonBlock w="100%" h={80} r={12} />
            <SkeletonBlock w="100%" h={60} r={12} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (isError || !product) {
    return (
      <View style={styles.container}>
        <View style={[styles.floatingHeader, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </Pressable>
        </View>
        <View style={styles.errorCenter}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color={C.textMuted} />
          </View>
          <Text style={styles.errorTitle}>Could not load product</Text>
          <Text style={styles.errorSub}>Check your connection and try again</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Ionicons name="refresh-outline" size={16} color={C.textInverse} />
            <Text style={styles.retryBtnTxt}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const serviceLabel = productType === "food" ? "Food" : productType === "pharmacy" ? "Pharmacy" : "Mart";
  const currentServiceLabel = cartType === "pharmacy" ? "Pharmacy" : cartType === "food" ? "Food" : cartType === "mart" ? "Mart" : "Another service";

  const summary: ReviewSummary = reviewSummary || { average: 0, total: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const reviews: ProductReview[] = reviewsData?.reviews || [];

  return (
    <View style={styles.container}>
      <CartSwitchModal
        visible={showSwitchModal}
        targetService={serviceLabel}
        currentService={currentServiceLabel}
        onCancel={() => setShowSwitchModal(false)}
        onConfirm={() => { setShowSwitchModal(false); clearCart(); doAdd(); }}
      />

      <WriteReviewModal
        visible={showWriteReview}
        onClose={() => setShowWriteReview(false)}
        productId={id || ""}
        onSuccess={handleReviewSuccess}
      />

      <FullScreenImageViewer
        visible={showFullScreen}
        images={images}
        initialIndex={activeImageIndex}
        onClose={() => setShowFullScreen(false)}
      />

      <Animated.View style={[styles.stickyHeader, { paddingTop: topPad + 8, opacity: headerOpacity }]}>
        <View style={styles.stickyHeaderInner}>
          <Pressable onPress={() => router.back()} style={styles.headerBtnSolid}>
            <Ionicons name="arrow-back" size={20} color={C.text} />
          </Pressable>
          <Text style={styles.stickyTitle} numberOfLines={1}>{product.name}</Text>
          <Pressable onPress={() => router.push("/cart")} style={styles.headerBtnSolid}>
            <Ionicons name="bag-outline" size={20} color={C.text} />
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeTxt}>{itemCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </Animated.View>

      <View style={[styles.floatingHeader, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={C.textInverse} />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Pressable onPress={toggleWishlist} style={styles.headerBtn}>
              <Ionicons name={isInWishlist ? "heart" : "heart-outline"} size={22} color={isInWishlist ? C.danger : C.textInverse} />
            </Pressable>
          </Animated.View>
          <Pressable onPress={() => router.push("/cart")} style={styles.headerBtn}>
            <Ionicons name="bag-outline" size={22} color={C.textInverse} />
            {itemCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeTxt}>{itemCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <View style={styles.imageContainer}>
          {images.length > 0 ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                setActiveImageIndex(idx);
              }}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => { setActiveImageIndex(index); setShowFullScreen(true); }}>
                  <Image source={{ uri: item }} style={{ width: SCREEN_W, height: IMAGE_H }} resizeMode="cover" />
                </Pressable>
              )}
              keyExtractor={(_, i) => String(i)}
            />
          ) : (
            <LinearGradient colors={[C.background, C.border]} style={[styles.placeholderImage, { height: IMAGE_H }]}>
              <View style={styles.placeholderIconWrap}>
                <Ionicons
                  name={productType === "food" ? "restaurant-outline" : productType === "pharmacy" ? "medical-outline" : "basket-outline"}
                  size={48}
                  color={C.textMuted}
                />
              </View>
              <Text style={styles.placeholderText}>No image available</Text>
            </LinearGradient>
          )}

          {images.length > 1 && (
            <View style={styles.dotRow}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeImageIndex && styles.dotActive]} />
              ))}
            </View>
          )}

          {discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountTxt}>{discount}% OFF</Text>
            </View>
          )}
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{product.name}</Text>
              {product.unit && <Text style={styles.unit}>{product.unit}</Text>}
            </View>
            {product.inStock ? (
              <View style={styles.stockBadge}>
                <View style={styles.stockDot} />
                <Text style={styles.stockTxt}>In Stock</Text>
              </View>
            ) : (
              <View style={[styles.stockBadge, { backgroundColor: C.dangerSoft }]}>
                <Text style={[styles.stockTxt, { color: C.danger }]}>Out of Stock</Text>
              </View>
            )}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>Rs. {price.toLocaleString()}</Text>
            {origPrice > price && (
              <Text style={styles.origPrice}>Rs. {origPrice.toLocaleString()}</Text>
            )}
          </View>

          {(product.rating != null || product.reviewCount != null) && (
            <View style={styles.ratingSection}>
              <StarRating rating={product.rating || 0} />
              <Text style={styles.ratingNum}>{(product.rating || 0).toFixed(1)}</Text>
              {product.reviewCount != null && (
                <Text style={styles.reviewCount}>({product.reviewCount} reviews)</Text>
              )}
            </View>
          )}

          {variants && variants.length > 0 && (
            <View style={variantStyles.section}>
              <Text style={variantStyles.title}>Available Options</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {variants.map((v: any) => {
                  const isSelected = selectedVariant === v.id;
                  const vPrice = Number(v.price) || price;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setSelectedVariant(isSelected ? null : v.id)}
                      style={[variantStyles.chip, isSelected && variantStyles.chipSelected, !v.inStock && variantStyles.chipOos]}
                    >
                      <Text style={[variantStyles.chipName, isSelected && variantStyles.chipNameSelected]}>{v.label}</Text>
                      <Text style={[variantStyles.chipPrice, isSelected && variantStyles.chipPriceSelected]}>Rs. {vPrice.toLocaleString()}</Text>
                      {!v.inStock && <Text style={variantStyles.oosLabel}>Out of Stock</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.divider} />

          {product.vendorName && (
            <View style={styles.vendorSection}>
              <View style={styles.vendorIcon}>
                <Ionicons name="storefront-outline" size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vendorLabel}>Sold by</Text>
                <Text style={styles.vendorName}>{product.vendorName}</Text>
              </View>
              {product.deliveryTime && (
                <View style={styles.deliveryBadge}>
                  <Ionicons name="time-outline" size={12} color={C.emerald} />
                  <Text style={styles.deliveryTime}>{product.deliveryTime}</Text>
                </View>
              )}
            </View>
          )}

          {product.description && (
            <>
              <View style={styles.divider} />
              <View style={styles.descSection}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.descText}>{product.description}</Text>
              </View>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.specsSection}>
            <Text style={styles.sectionTitle}>Product Details</Text>
            <View style={styles.specGrid}>
              <View style={styles.specItem}>
                <Ionicons name="pricetag-outline" size={16} color={C.primary} />
                <View>
                  <Text style={styles.specLabel}>Category</Text>
                  <Text style={styles.specValue}>{product.category}</Text>
                </View>
              </View>
              <View style={styles.specItem}>
                <Ionicons name="cube-outline" size={16} color={C.primary} />
                <View>
                  <Text style={styles.specLabel}>Type</Text>
                  <Text style={styles.specValue}>{serviceLabel}</Text>
                </View>
              </View>
              {product.unit && (
                <View style={styles.specItem}>
                  <Ionicons name="scale-outline" size={16} color={C.primary} />
                  <View>
                    <Text style={styles.specLabel}>Unit</Text>
                    <Text style={styles.specValue}>{product.unit}</Text>
                  </View>
                </View>
              )}
              <View style={styles.specItem}>
                <Ionicons name={product.inStock ? "checkmark-circle-outline" : "close-circle-outline"} size={16} color={product.inStock ? C.emerald : C.danger} />
                <View>
                  <Text style={styles.specLabel}>Availability</Text>
                  <Text style={styles.specValue}>{product.inStock ? "Available" : "Unavailable"}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.reviewsSection}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Ratings & Reviews</Text>
              <Pressable
                onPress={() => isLoggedIn ? setShowWriteReview(true) : router.push("/auth")}
                style={rs.writeBtn}
              >
                <Ionicons name="create-outline" size={14} color={C.primary} />
                <Text style={rs.writeBtnTxt}>Write Review</Text>
              </Pressable>
            </View>

            {(summary.total > 0 || (product.rating != null)) && (
              <View style={styles.ratingOverview}>
                <View style={styles.ratingBig}>
                  <Text style={styles.ratingBigNum}>{summary.total > 0 ? summary.average.toFixed(1) : (product.rating || 0).toFixed(1)}</Text>
                  <StarRating rating={summary.total > 0 ? summary.average : (product.rating || 0)} size={18} />
                  <Text style={styles.ratingBigSub}>
                    {summary.total > 0 ? summary.total : (product.reviewCount || 0)} review{(summary.total > 0 ? summary.total : (product.reviewCount || 0)) !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.ratingBars}>
                  {[5, 4, 3, 2, 1].map(star => {
                    const count = summary.distribution[star] || 0;
                    const pct = summary.total > 0 ? Math.round((count / summary.total) * 100) : (star === 5 ? 60 : star === 4 ? 25 : star === 3 ? 10 : star === 2 ? 3 : 2);
                    return (
                      <View key={star} style={styles.ratingBarRow}>
                        <Text style={styles.ratingBarLabel}>{star}</Text>
                        <Ionicons name="star" size={10} color={C.gold} />
                        <View style={styles.ratingBarTrack}>
                          <View style={[styles.ratingBarFill, { width: `${pct}%` }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {reviews.length > 0 && (
              <View style={{ marginTop: 16, gap: 12 }}>
                {reviews.map(r => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </View>
            )}

            {reviews.length === 0 && summary.total === 0 && (
              <View style={rs.emptyReviews}>
                <Ionicons name="chatbubble-outline" size={32} color={C.textMuted} />
                <Text style={rs.emptyTitle}>No reviews yet</Text>
                <Text style={rs.emptySub}>Be the first to review this product</Text>
                {!isLoggedIn && (
                  <Pressable onPress={() => router.push("/auth")} style={rs.loginBtn}>
                    <Text style={rs.loginBtnTxt}>Sign in to review</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {relatedProducts.length > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.relatedSection}>
                <Text style={styles.sectionTitle}>You May Also Like</Text>
                <View style={styles.relatedGrid}>
                  {relatedProducts.map(rp => {
                    const rpOrig = Number(rp.originalPrice) || 0;
                    const rpPrice = Number(rp.price) || 0;
                    const rpDiscount = rpOrig > rpPrice ? Math.round(((rpOrig - rpPrice) / rpOrig) * 100) : 0;
                    return (
                      <Pressable
                        key={rp.id}
                        onPress={() => router.push({ pathname: "/product/[id]", params: { id: rp.id } })}
                        style={styles.relatedCard}
                      >
                        <View style={styles.relatedImg}>
                          {rp.image ? (
                            <Image source={{ uri: rp.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                          ) : (
                            <Ionicons name="basket-outline" size={24} color={C.textMuted} />
                          )}
                          {rpDiscount > 0 && (
                            <View style={styles.relatedDiscBadge}>
                              <Text style={styles.relatedDiscTxt}>{rpDiscount}%</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.relatedBody}>
                          <Text style={styles.relatedName} numberOfLines={2}>{rp.name}</Text>
                          <Text style={styles.relatedPrice}>Rs. {rp.price}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          <View style={{ height: 100 + bottomPad }} />
        </View>
      </Animated.ScrollView>

      <View style={[styles.stickyFooter, { paddingBottom: bottomPad + 8 }]}>
        <View style={styles.footerPriceCol}>
          <Text style={styles.footerPriceLabel}>Total Price</Text>
          <Text style={styles.footerPrice}>Rs. {price.toLocaleString()}</Text>
        </View>
        <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
          <Pressable
            onPress={handleAdd}
            disabled={!product.inStock}
            style={[styles.addToCartBtn, added && styles.addToCartBtnDone, !product.inStock && styles.addToCartBtnDisabled]}
          >
            <Ionicons name={added ? "checkmark-circle" : "bag-add-outline"} size={20} color={C.textInverse} />
            <Text style={styles.addToCartTxt}>
              {!product.inStock ? "Out of Stock" : added ? "Added to Cart!" : "Add to Cart"}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const rs = StyleSheet.create({
  card: { backgroundColor: C.surfaceSecondary, borderRadius: 14, padding: 14, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontFamily: Font.bold, fontSize: 14, color: C.primary },
  userName: { fontFamily: Font.semiBold, fontSize: 13, color: C.text },
  date: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted, marginTop: 1 },
  comment: { fontFamily: Font.regular, fontSize: 13, color: C.textSecondary, lineHeight: 19 },
  photoRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  photoThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.border },
  vendorReplyWrap: { backgroundColor: C.surface, borderRadius: 10, padding: 10, marginTop: 4, borderLeftWidth: 3, borderLeftColor: C.primary },
  vendorReplyHeader: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  vendorReplyLabel: { fontFamily: Font.semiBold, fontSize: 11, color: C.primary },
  vendorReplyText: { fontFamily: Font.regular, fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  fullScreenOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  fullScreenClose: { position: "absolute", top: 60, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  fullScreenImg: { width: SCREEN_W, height: SCREEN_W },
  writeBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.primarySoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  writeBtnTxt: { fontFamily: Font.semiBold, fontSize: 12, color: C.primary },
  emptyReviews: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyTitle: { fontFamily: Font.semiBold, fontSize: 15, color: C.text },
  emptySub: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted },
  loginBtn: { marginTop: 8, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  loginBtnTxt: { fontFamily: Font.semiBold, fontSize: 13, color: C.textInverse },
});

const wr = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, maxHeight: "85%" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginTop: 10, marginBottom: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontFamily: Font.bold, fontSize: 18, color: C.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: Font.semiBold, fontSize: 14, color: C.text, marginTop: 16, marginBottom: 8 },
  starRow: { alignItems: "center", paddingVertical: 8 },
  textInput: { backgroundColor: C.surfaceSecondary, borderRadius: 14, padding: 14, fontFamily: Font.regular, fontSize: 14, color: C.text, minHeight: 100, borderWidth: 1, borderColor: C.border },
  charCount: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted, textAlign: "right", marginTop: 4 },
  photoRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  photoWrap: { position: "relative" },
  photoPreview: { width: 72, height: 72, borderRadius: 12, backgroundColor: C.border },
  photoRemove: { position: "absolute", top: -6, right: -6 },
  addPhotoBtn: { width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  addPhotoTxt: { fontFamily: Font.medium, fontSize: 11, color: C.primary },
  error: { fontFamily: Font.medium, fontSize: 13, color: C.danger, marginTop: 12, textAlign: "center" },
  submitBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 20 },
  submitBtnDisabled: { backgroundColor: C.textMuted, opacity: 0.6 },
  submitBtnTxt: { fontFamily: Font.bold, fontSize: 15, color: C.textInverse },
});

const fs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  closeBtn: { position: "absolute", top: 60, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  zoomHint: { position: "absolute", top: 68, alignSelf: "center", zIndex: 10, fontFamily: Font.medium, fontSize: 12, color: "rgba(255,255,255,0.5)" },
  dotRow: { position: "absolute", bottom: 60, alignSelf: "center", flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.4)" },
  dotActive: { backgroundColor: "#fff", width: 20 },
  counter: { position: "absolute", bottom: 30, alignSelf: "center", fontFamily: Font.medium, fontSize: 13, color: "rgba(255,255,255,0.7)" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },

  floatingHeader: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 8,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.overlayDark35,
    alignItems: "center", justifyContent: "center",
  },
  stickyHeader: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
    paddingBottom: 10,
  },
  stickyHeaderInner: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12,
  },
  headerBtnSolid: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  stickyTitle: { flex: 1, ...Typ.h3, fontSize: 16, color: C.text },
  cartBadge: {
    position: "absolute", top: -4, right: -4, backgroundColor: C.danger,
    borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeTxt: { ...Typ.tiny, color: C.textInverse },

  imageContainer: { position: "relative" },
  placeholderImage: { width: SCREEN_W, alignItems: "center", justifyContent: "center" },
  placeholderIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  placeholderText: { fontFamily: Font.medium, fontSize: 13, color: C.textMuted },
  dotRow: { position: "absolute", bottom: 16, alignSelf: "center", flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.overlayLight50 },
  dotActive: { backgroundColor: C.surface, width: 20 },
  discountBadge: {
    position: "absolute", top: 16, left: 16, backgroundColor: C.danger,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
  },
  discountTxt: { ...Typ.buttonSmall, fontFamily: Font.bold, color: C.textInverse },

  contentContainer: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, paddingTop: 24, paddingHorizontal: 16 },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  productName: { ...Typ.h2, color: C.text, lineHeight: 28 },
  unit: { ...Typ.body, fontSize: 13, color: C.textSecondary, marginTop: 4 },
  stockBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.successSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  stockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  stockTxt: { ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.emerald },

  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 12 },
  price: { ...Typ.h1, fontSize: 26, color: C.primary },
  origPrice: { ...Typ.body, fontSize: 16, color: C.textMuted, textDecorationLine: "line-through" },

  ratingSection: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  ratingNum: { ...Typ.body, fontFamily: Font.bold, color: C.amberDark },
  reviewCount: { ...Typ.body, fontSize: 13, color: C.textMuted },

  divider: { height: 1, backgroundColor: C.border, marginVertical: 16 },

  vendorSection: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  vendorIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  vendorLabel: { ...Typ.caption, color: C.textMuted },
  vendorName: { ...Typ.button, color: C.text, marginTop: 1 },
  deliveryBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.successSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  deliveryTime: { ...Typ.smallMedium, fontFamily: Font.semiBold, color: C.emerald },

  descSection: {},
  sectionTitle: { ...Typ.price, color: C.text, marginBottom: 12 },
  descText: { ...Typ.body, color: C.textSecondary, lineHeight: 22 },

  specsSection: {},
  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  specItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    width: "47%", backgroundColor: C.surfaceSecondary, borderRadius: 12,
    padding: 12,
  },
  specLabel: { ...Typ.small, color: C.textMuted },
  specValue: { ...Typ.buttonSmall, color: C.text, marginTop: 1 },

  reviewsSection: {},
  ratingOverview: { flexDirection: "row", gap: 20, alignItems: "center" },
  ratingBig: { alignItems: "center", gap: 6 },
  ratingBigNum: { ...Typ.h1, fontSize: 40, color: C.text },
  ratingBigSub: { ...Typ.caption, color: C.textMuted },
  ratingBars: { flex: 1, gap: 4 },
  ratingBarRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingBarLabel: { ...Typ.captionMedium, color: C.textSecondary, width: 12, textAlign: "right" },
  ratingBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.surfaceSecondary },
  ratingBarFill: { height: 6, borderRadius: 3, backgroundColor: C.gold },

  relatedSection: { marginBottom: 8 },
  relatedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  relatedCard: {
    width: (SCREEN_W - 32 - 10) / 2, backgroundColor: C.surface, borderRadius: 16,
    overflow: "hidden", borderWidth: 1, borderColor: C.border,
  },
  relatedImg: { height: 100, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  relatedDiscBadge: { position: "absolute", top: 6, left: 6, backgroundColor: C.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  relatedDiscTxt: { ...Typ.tiny, color: C.textInverse },
  relatedBody: { padding: 10 },
  relatedName: { ...Typ.captionMedium, color: C.text, marginBottom: 4, minHeight: 30 },
  relatedPrice: { ...Typ.body, fontFamily: Font.bold, color: C.primary },

  stickyFooter: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.border,
    shadowColor: C.text, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 10,
  },
  footerPriceCol: {},
  footerPriceLabel: { ...Typ.small, color: C.textMuted },
  footerPrice: { ...Typ.title, color: C.text },
  addToCartBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  addToCartBtnDone: { backgroundColor: C.success },
  addToCartBtnDisabled: { backgroundColor: C.textMuted, shadowOpacity: 0 },
  addToCartTxt: { ...Typ.h3, fontSize: 16, color: C.textInverse },

  errorCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  errorTitle: { ...Typ.h3, color: C.text },
  errorSub: { ...Typ.body, fontSize: 13, color: C.textMuted },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 4 },
  retryBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },
});

const variantStyles = StyleSheet.create({
  section: { marginTop: 12, marginBottom: 4 },
  title: { ...Typ.h3, fontSize: 15, color: C.text, marginBottom: 10 },
  chip: { backgroundColor: C.surfaceSecondary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1.5, borderColor: C.border, minWidth: 90, alignItems: "center" },
  chipSelected: { borderColor: C.primary, backgroundColor: C.primarySoft },
  chipOos: { opacity: 0.5 },
  chipName: { ...Typ.captionBold, color: C.text, marginBottom: 2 },
  chipNameSelected: { color: C.primary },
  chipPrice: { ...Typ.small, color: C.textSecondary },
  chipPriceSelected: { color: C.primary },
  oosLabel: { ...Typ.tiny, color: C.danger, marginTop: 2 },
});
