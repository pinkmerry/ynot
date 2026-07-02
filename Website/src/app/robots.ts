import type { MetadataRoute } from "next";
import { getRobotsPolicy } from "@/lib/seo/public-answer-pages";

export default function robots(): MetadataRoute.Robots {
  return getRobotsPolicy() as MetadataRoute.Robots;
}
