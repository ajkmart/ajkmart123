import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/context/AuthContext";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  type: "mart" | "food" | "pharmacy";
}

export interface CartValidationResult {
  valid: boolean;
  cartChanged: boolean;
}

export interface AckSuccessData {
  id: string;
  time: string;
  payMethod?: string;
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  total: number;
  cartType: "mart" | "food" | "pharmacy" | "mixed" | "none";
  addItem: (item: CartItem) => void;
  clearCartAndAdd: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  clearCartOnAck: () => void;
  restoreCart: (snapshot: CartItem[]) => void;
  validateCart: () => Promise<CartValidationResult>;
  isValidating: boolean;
  pendingAck: boolean;
  setPendingAck: (v: boolean) => void;
  ackStuck: boolean;
  orderSuccess: AckSuccessData | null;
  clearOrderSuccess: () => void;
  setPendingOrderId: (id: string | null, data?: AckSuccessData | null) => void;
  startAckStuckTimer: (delayMs: number) => void;
  cancelAckStuckTimer: () => void;
  dismissAck: () => void;
  setPharmacyPendingOrderId: (id: string | null) => void;
}

const CartContext = createContext<CartContextType | null>(null);

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { token, socket } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pendingAck, setPendingAck] = useState(false);
  const [ackStuck, setAckStuck] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<AckSuccessData | null>(null);
  const authTokenRef = useRef<string | null | undefined>(token);
  const pharmacyPendingOrderIdRef = useRef<string | null>(null);
  const pendingOrderIdRef = useRef<string | null>(null);
  const pendingOrderDataRef = useRef<AckSuccessData | null>(null);
  const ackStuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    authTokenRef.current = token;
  }, [token]);

  const save = (newItems: CartItem[]) => {
    setItems(newItems);
    AsyncStorage.setItem("@ajkmart_cart", JSON.stringify(newItems));
  };

  const resetAckState = useCallback(() => {
    if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
    if (ackFallbackTimerRef.current) { clearTimeout(ackFallbackTimerRef.current); ackFallbackTimerRef.current = null; }
    if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
    pendingOrderIdRef.current = null;
    pendingOrderDataRef.current = null;
    setPendingAck(false);
    setAckStuck(false);
  }, []);

  const clearCartOnAck = useCallback(() => {
    setPendingAck(false);
    setItems([]);
    AsyncStorage.removeItem("@ajkmart_cart");
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleAck = (payload: { orderId?: string; id?: string }) => {
      const ackId = payload?.orderId ?? payload?.id;
      const pending = pendingOrderIdRef.current;
      if (!pending) return;
      if (ackId && ackId !== pending) return;
      if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
      const data = pendingOrderDataRef.current;
      pendingOrderIdRef.current = null;
      pendingOrderDataRef.current = null;
      setAckStuck(false);
      clearCartOnAck();
      if (data) setOrderSuccess(data);
    };
    socket.on("order:ack", handleAck);
    socket.on("order:confirmed", handleAck);
    return () => {
      socket.off("order:ack", handleAck);
      socket.off("order:confirmed", handleAck);
    };
  }, [socket, clearCartOnAck]);

  useEffect(() => {
    if (!socket) return;
    const handlePharmacyAck = (payload: { orderId?: string; id?: string }) => {
      const ackId = payload?.orderId ?? payload?.id;
      const pending = pharmacyPendingOrderIdRef.current;
      if (!pending) return;
      if (ackId && ackId !== pending) return;
      pharmacyPendingOrderIdRef.current = null;
      setItems(current => {
        const remaining = current.filter(i => i.type !== "pharmacy");
        AsyncStorage.setItem("@ajkmart_cart", JSON.stringify(remaining));
        return remaining;
      });
    };
    socket.on("order:ack", handlePharmacyAck);
    socket.on("order:confirmed", handlePharmacyAck);
    return () => {
      socket.off("order:ack", handlePharmacyAck);
      socket.off("order:confirmed", handlePharmacyAck);
    };
  }, [socket]);

  useEffect(() => {
    AsyncStorage.getItem("@ajkmart_cart").then(stored => {
      if (!stored) { setHasLoaded(true); return; }
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setItems(parsed);
      } catch (parseErr) {
        console.warn("[Cart] Failed to parse stored cart — clearing:", parseErr instanceof Error ? parseErr.message : String(parseErr));
        AsyncStorage.removeItem("@ajkmart_cart");
      }
      setHasLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (hasLoaded && items.length > 0) {
      validateCartItems(items);
    }
  }, [hasLoaded, token]);

  const validateCartItems = async (cartItems: CartItem[]): Promise<CartValidationResult> => {
    if (cartItems.length === 0) return { valid: true, cartChanged: false };
    setIsValidating(true);
    try {
      let storedToken = authTokenRef.current;
      if (!storedToken) {
        try {
          const SS = await import("expo-secure-store");
          storedToken = await SS.getItemAsync("ajkmart_token");
        } catch {}
      }
      if (!storedToken) storedToken = await AsyncStorage.getItem("@ajkmart_token");
      const res = await fetch(`${API_BASE}/orders/validate-cart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        },
        body: JSON.stringify({ items: cartItems }),
      });
      if (!res.ok) {
        setIsValidating(false);
        return { valid: false, cartChanged: false };
      }
      const data = await res.json();
      if (!data.valid) {
        let cartChanged = false;
        if (Array.isArray(data.items)) {
          save(data.items);
          cartChanged = true;
        }
        const messages: string[] = [];
        if (data.removed?.length > 0) {
          messages.push(`Removed (unavailable): ${data.removed.join(", ")}`);
        }
        if (data.priceChanges?.length > 0) {
          const changes = data.priceChanges.map((c: any) => `${c.name}: Rs.${c.oldPrice} → Rs.${c.newPrice}`).join("\n");
          messages.push(`Prices updated:\n${changes}`);
        }
        if (messages.length > 0) {
          await new Promise<void>(resolve => {
            Alert.alert("Cart Updated", messages.join("\n\n") + "\n\nPlease review your cart before placing the order.", [
              { text: "Review Cart", onPress: () => resolve() },
            ]);
          });
        }
        setIsValidating(false);
        return { valid: false, cartChanged };
      }
      setIsValidating(false);
      return { valid: true, cartChanged: false };
    } catch (err: any) {
      setIsValidating(false);
      Alert.alert(
        "Validation Error",
        "Could not validate your cart. Please check your connection and try again.",
        [{ text: "OK" }]
      );
      return { valid: false, cartChanged: false };
    }
  };

  const validateCart = useCallback(async (): Promise<CartValidationResult> => {
    return validateCartItems(items);
  }, [items]);

  const addItem = (item: CartItem) => {
    const existing = items.find(i => i.productId === item.productId);
    if (existing) {
      save(items.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i));
      return;
    }

    const types = [...new Set(items.map(i => i.type))];
    const currentType = types.length === 1 ? types[0] : null;

    if (items.length > 0 && currentType === null) {
      Alert.alert("Mixed Cart", "Your cart has mixed items. Please clear your cart before adding new items.", [{ text: "OK" }]);
      return;
    }

    if (currentType && currentType !== item.type && items.length > 0) {
      const nameFor = (t: string) => t === "mart" ? "Mart" : t === "food" ? "Food" : "Pharmacy";
      Alert.alert(
        "Mixed Cart",
        `Your cart has items from ${nameFor(currentType)}. Adding ${nameFor(item.type)} items will clear your cart. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, Clear & Add",
            style: "destructive",
            onPress: () => { save([item]); },
          },
        ]
      );
      return;
    }

    save([...items, item]);
  };

  const clearCartAndAdd = (item: CartItem) => {
    resetAckState();
    save([item]);
  };

  const removeItem = (productId: string) => save(items.filter(i => i.productId !== productId));

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) return removeItem(productId);
    save(items.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
  };

  const clearCart = () => {
    resetAckState();
    save([]);
  };

  const restoreCart = (snapshot: CartItem[]) => {
    resetAckState();
    save([...snapshot]);
  };

  const dismissAck = useCallback(() => {
    resetAckState();
  }, [resetAckState]);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const types = [...new Set(items.map(i => i.type))];
  const cartType: "mart" | "food" | "pharmacy" | "mixed" | "none" =
    types.length === 0 ? "none" :
    types.length === 1 ? (types[0] as "mart" | "food" | "pharmacy") :
    "mixed";

  const setPharmacyPendingOrderId = (id: string | null) => {
    pharmacyPendingOrderIdRef.current = id;
  };

  const setPendingOrderId = (id: string | null, data?: AckSuccessData | null) => {
    pendingOrderIdRef.current = id;
    pendingOrderDataRef.current = data ?? null;
  };

  const ackFallbackIvRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resolveOrderAck = (oid: string) => {
    const data = pendingOrderDataRef.current;
    if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
    if (ackFallbackTimerRef.current) { clearTimeout(ackFallbackTimerRef.current); ackFallbackTimerRef.current = null; }
    if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
    pendingOrderIdRef.current = null;
    pendingOrderDataRef.current = null;
    setAckStuck(false);
    clearCartOnAck();
    if (data) setOrderSuccess(data);
  };

  const tryHttpFallback = async (): Promise<boolean> => {
    const oid = pendingOrderIdRef.current;
    if (!oid) return false;
    try {
      const tkn = authTokenRef.current;
      const res = await fetch(`${API_BASE}/orders/${oid}`, {
        headers: tkn ? { Authorization: `Bearer ${tkn}` } : {},
      });
      if (res.ok) {
        const d = await res.json();
        const order = d.order || d;
        if (order && order.id) {
          resolveOrderAck(oid);
          return true;
        }
      }
    } catch {}
    return false;
  };

  const startAckStuckTimer = (delayMs: number) => {
    if (ackStuckTimerRef.current) clearTimeout(ackStuckTimerRef.current);
    if (ackFallbackTimerRef.current) clearTimeout(ackFallbackTimerRef.current);
    if (ackFallbackIvRef.current) clearInterval(ackFallbackIvRef.current);

    ackFallbackTimerRef.current = setTimeout(() => {
      let attempts = 0;
      ackFallbackIvRef.current = setInterval(async () => {
        attempts++;
        const resolved = await tryHttpFallback();
        if (resolved || attempts >= 6) {
          if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
        }
      }, 5000);
      tryHttpFallback();
    }, 10000);

    ackStuckTimerRef.current = setTimeout(async () => {
      if (!pendingOrderIdRef.current) return;
      const resolved = await tryHttpFallback();
      if (!resolved && pendingOrderIdRef.current) setAckStuck(true);
    }, delayMs);
  };

  const cancelAckStuckTimer = () => {
    if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
    if (ackFallbackTimerRef.current) { clearTimeout(ackFallbackTimerRef.current); ackFallbackTimerRef.current = null; }
    if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
  };

  const clearOrderSuccess = () => setOrderSuccess(null);

  return (
    <CartContext.Provider value={{
      items, itemCount, total, cartType,
      addItem, clearCartAndAdd, removeItem, updateQuantity,
      clearCart, clearCartOnAck, restoreCart, validateCart, isValidating,
      pendingAck, setPendingAck,
      ackStuck,
      orderSuccess, clearOrderSuccess,
      setPendingOrderId, startAckStuckTimer, cancelAckStuckTimer,
      dismissAck,
      setPharmacyPendingOrderId,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
