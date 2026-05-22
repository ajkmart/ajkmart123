import { Redirect, useLocalSearchParams } from "expo-router";

export default function FoodStoreRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/food/restaurant/${id}`} />;
}
