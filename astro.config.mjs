import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

/**
 * Astroの全体設定ファイルです。
 * Tailwind CSS、Sitemapの統合、および外部画像の最適化許可設定を含みます。
 */
export default defineConfig({
  // サイトの公開URL（Sitemap生成などに使用。本番URLに書き換えてください）
  site: "https://your-gallery-site.com",

  integrations: [
    // Tailwind CSSの有効化
    tailwind(),
    // サイトマップ自動生成の有効化
    sitemap(),
  ],

  image: {
    /**
     * 外部ドメインの画像最適化許可設定。
     * Astroの <Image /> や getImage() を使って外部画像をWebP化するために必須です。
     */
    domains: [
      "images.unsplash.com",      // プレースホルダー用
      "api.xx-ai-girls-miu.com",  // ★ココが重要！実際のWordPressのメディアドメイン
    ],
  },
});