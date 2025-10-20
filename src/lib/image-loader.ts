import type { ImageLoader } from "next/image";

export const passthroughImageLoader: ImageLoader = ({ src }) => src;
