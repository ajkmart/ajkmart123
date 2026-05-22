import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Colors from "@/constants/colors";

const C = Colors.light;

function SkeletonPulse({ style }: { style?: any }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { backgroundColor: "#E2E8F0", borderRadius: 8, opacity },
        style,
      ]}
    />
  );
}

export function ServiceListSkeleton() {
  return (
    <View style={{ marginBottom: 16 }}>
      <SkeletonPulse style={{ width: 120, height: 16, marginBottom: 12 }} />
      <View
        style={{
          flexDirection: "row",
          gap: 10,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: 150,
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: C.border,
              backgroundColor: "#fff",
            }}
          >
            <SkeletonPulse
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                marginBottom: 10,
              }}
            />
            <SkeletonPulse
              style={{ width: 80, height: 16, marginBottom: 6 }}
            />
            <SkeletonPulse style={{ width: 60, height: 12, marginBottom: 8 }} />
            <View style={{ gap: 4 }}>
              <SkeletonPulse style={{ width: 100, height: 10 }} />
              <SkeletonPulse style={{ width: 70, height: 10 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function FareEstimateSkeleton() {
  return (
    <View
      style={{
        borderRadius: 18,
        overflow: "hidden",
        marginBottom: 14,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: "#fff",
        padding: 18,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <SkeletonPulse style={{ width: 100, height: 16 }} />
        <SkeletonPulse
          style={{ width: 60, height: 24, borderRadius: 10 }}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, alignItems: "center" }}>
          <SkeletonPulse
            style={{ width: 50, height: 12, marginBottom: 4 }}
          />
          <SkeletonPulse style={{ width: 60, height: 18 }} />
        </View>
        <View
          style={{ width: 1, height: 36, backgroundColor: C.border }}
        />
        <View style={{ flex: 1, alignItems: "center" }}>
          <SkeletonPulse
            style={{ width: 50, height: 12, marginBottom: 4 }}
          />
          <SkeletonPulse style={{ width: 60, height: 18 }} />
        </View>
        <View
          style={{ width: 1, height: 36, backgroundColor: C.border }}
        />
        <View style={{ flex: 1, alignItems: "center" }}>
          <SkeletonPulse
            style={{ width: 40, height: 12, marginBottom: 4 }}
          />
          <SkeletonPulse style={{ width: 70, height: 22 }} />
        </View>
      </View>
    </View>
  );
}

export function RideStatusSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: C.background, padding: 20 }}>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 20,
          padding: 18,
          borderWidth: 1,
          borderColor: C.border,
          marginBottom: 14,
        }}
      >
        <SkeletonPulse
          style={{ width: 120, height: 16, marginBottom: 18 }}
        />
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          {[0, 1, 2, 3].map((i) => (
            <React.Fragment key={i}>
              <View style={{ alignItems: "center", flex: 1, gap: 6 }}>
                <SkeletonPulse
                  style={{ width: 32, height: 32, borderRadius: 16 }}
                />
                <SkeletonPulse style={{ width: 40, height: 10 }} />
              </View>
              {i < 3 && (
                <SkeletonPulse
                  style={{
                    height: 2,
                    flex: 0.4,
                    marginTop: 15,
                    borderRadius: 1,
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </View>
      </View>
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 20,
          padding: 18,
          borderWidth: 1,
          borderColor: C.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <SkeletonPulse
            style={{ width: 56, height: 56, borderRadius: 18 }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonPulse style={{ width: 120, height: 16 }} />
            <SkeletonPulse style={{ width: 90, height: 12 }} />
          </View>
        </View>
      </View>
    </View>
  );
}
