"use client";
import { useLocalData } from "@/lib/static/store";
import { SkeletonCards } from "@/components/ui";
import { RoiView, type ModelRecord } from "./RoiView";

/** On the static site the bets live in this browser. */
export function StaticRoi({ model }: { model: ModelRecord }) {
  const data = useLocalData();
  if (!data) return <SkeletonCards n={2} h={220} />;
  return <RoiView bets={data.bets} settings={data.settings} model={model} />;
}
