// The home page. A server component only to read the hero staff set
// (lib/heroMedia.server.ts) and preload it, so the HTML arrives naming the
// photo the visitor will see: phones fetch the 1000px crop, wide screens the
// full one, and nothing is fetched twice. Everything else is HomeRoute.

import { preload } from "react-dom";
import { HomeRoute } from "@/components/sections/HomeRoute";
import { loadHeroMedia } from "@/lib/heroMedia.server";
import { HERO_BG } from "@/lib/constants";
import { imageAt } from "@/lib/img";

export default async function HomePage() {
  const hero = await loadHeroMedia();
  // A video hero has no photo to preload; it starts on its own.
  if (hero?.kind !== "video") {
    const src = hero?.kind === "image" ? hero.src : HERO_BG;
    preload(imageAt(src, 1000), { as: "image", media: "(max-width: 900px)", fetchPriority: "high" });
    preload(src, { as: "image", media: "(min-width: 901px)", fetchPriority: "high" });
  }
  return <HomeRoute initialHero={hero} />;
}
