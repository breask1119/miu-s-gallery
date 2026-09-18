// src/lib/wp.ts
import { getDistributionByRating } from "./distribution";

export const DEFAULT_WP_GRAPHQL_URL = "https://api.xx-ai-girls-miu.com/graphql";

function getWpGraphqlUrl(): string {
  const envUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.PUBLIC_WP_GRAPHQL_URL) ||
    (typeof process !== "undefined" && process.env?.PUBLIC_WP_GRAPHQL_URL) ||
    "";
  const trimmed = envUrl.trim();
  return trimmed || DEFAULT_WP_GRAPHQL_URL;
}

/**
 * WPGraphQLのエンドポイントに対してリクエストを送信する共通関数です。
 */
export async function fetchAPI(
  query: string,
  { variables }: { variables?: any } = {},
) {
  let wpUrl = getWpGraphqlUrl();
  if (!wpUrl.endsWith("/")) wpUrl += "/";

  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Astro-Cloudflare-Pages-Builder",
  };

  try {
    const res = await fetch(wpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      console.error(`🚨【Fetchエラー】HTTPステータス: ${res.status}`);
      return {};
    }

    const text = await res.text();

    try {
      const json = JSON.parse(text);
      if (json.errors) {
        console.error("🚨【GraphQLエラー】:", json.errors);
        return json.data || {};
      }
      return json.data || {};
    } catch (e) {
      console.error("🚨【JSONパースエラー】");
      return {};
    }
  } catch (e) {
    console.error("🚨【ネットワークエラー】", e);
    return {};
  }
}

/**
 * 全ての artwork_image (Pods Admin) を WordPress REST API から一括取得します。
 * ページネーション (per_page=100) に対応し、全件を取得します。
 */
export async function getAllArtworkImages(): Promise<any[]> {
  const wpUrl = getWpGraphqlUrl();
  const baseUrl = wpUrl.replace(/\/graphql\/?$/i, "").replace(/\/+$/, "") || "https://api.xx-ai-girls-miu.com";
  const endpoint = `${baseUrl}/wp-json/wp/v2/artwork_image`;

  const allItems: any[] = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const url = `${endpoint}?per_page=${perPage}&page=${page}`;
      let res: Response | null = null;
      let lastErr: any = null;

      // 最大3回リトライ
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          res = await fetch(url, {
            headers: {
              Accept: "application/json",
              "User-Agent": "Astro-Cloudflare-Pages-Builder",
            },
          });
          if (res.ok || res.status === 400) break;
          console.warn(`[wp.ts] REST API attempt ${attempt} returned status ${res.status}, retrying...`);
        } catch (err) {
          lastErr = err;
          console.warn(`[wp.ts] REST API attempt ${attempt} network error:`, err);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!res) {
        console.error(`🚨【REST APIエラー】リトライ上限到達:`, lastErr);
        break;
      }

      if (!res.ok) {
        if (res.status === 400) break; // ページ範囲外
        const errText = await res.text().catch(() => "");
        console.error(`🚨【REST APIエラー】HTTPステータス: ${res.status}, Body: ${errText.substring(0, 200)}`);
        break;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      allItems.push(...data);

      const totalPagesHeader = res.headers.get("x-wp-totalpages");
      const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
      if (page >= totalPages || data.length < perPage) break;

      page++;
    }
  } catch (err) {
    console.error("🚨【REST API artwork_image取得エラー】:", err);
  }

  console.log(`[wp.ts] Total artwork_images fetched: ${allItems.length}`);
  return allItems;
}

/**
 * 各作品に対して REST API の artwork_image または従来の variationImages から
 * 統一されたギャラリー用画像配列を構築します。
 */
export function normalizeArtworkGalleryImages(
  artwork: any,
  artworkImagesByParentId: Map<number, any[]>,
  artworkImagesByParentTitle?: Map<string, any[]>
) {
  const artDbId = Number(artwork.databaseId);
  let attachedImages = artworkImagesByParentId.get(artDbId) || [];

  // IDで紐付かなかった場合、作品タイトル(post_title)でフォールバック照合
  if (attachedImages.length === 0 && artwork.title && artworkImagesByParentTitle) {
    const cleanTitle = artwork.title.trim().toLowerCase();
    attachedImages = artworkImagesByParentTitle.get(cleanTitle) || [];
  }

  const hasArtworkImages = attachedImages.length > 0;

  if (hasArtworkImages) {
    // 新方式: gallery_visible === true の画像のみをギャラリー表示
    // "1" -> true, 1 -> true, true -> true / "0" -> false, 0 -> false, false -> false
    const visibleImages = attachedImages.filter((item: any) => {
      const v = item.gallery_visible;
      return v === true || v === "1" || v === 1 || v === "true";
    });

    // ※artwork_image が存在するが gallery_visible=true が0件の場合は意図的非表示とみなし、
    // 旧方式へフォールバックせず画像0件として扱う
    if (visibleImages.length === 0) {
      return {
        hasArtworkImages: true,
        images: [],
      };
    }

    // 表示順は sort_order の昇順（未設定・null は最後尾）
    visibleImages.sort((a: any, b: any) => {
      const orderA =
        a.sort_order !== null && a.sort_order !== undefined && a.sort_order !== ""
          ? Number(a.sort_order)
          : Infinity;
      const orderB =
        b.sort_order !== null && b.sort_order !== undefined && b.sort_order !== ""
          ? Number(b.sort_order)
          : Infinity;

      const safeOrderA = isNaN(orderA) ? Infinity : orderA;
      const safeOrderB = isNaN(orderB) ? Infinity : orderB;

      if (safeOrderA !== safeOrderB) {
        return safeOrderA - safeOrderB;
      }
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    return {
      hasArtworkImages: true,
      images: visibleImages.map((item: any, idx: number) => {
        const title =
          item.title?.rendered ||
          item.title ||
          `${artwork.title} #${String(idx + 1).padStart(2, "0")}`;
        const sourceUrl = item.image?.guid || "";
        const rating = Array.isArray(item.content_rating)
          ? item.content_rating[0] || "safe"
          : item.content_rating || "safe";

        return {
          id: item.id || idx,
          title,
          sourceUrl,
          altText: title,
          contentRating: rating, // 将来のSNS自動投稿用データ
          sortOrder:
            item.sort_order !== undefined && item.sort_order !== null && item.sort_order !== ""
              ? Number(item.sort_order)
              : idx + 1,
          galleryVisible: true,
          distribution: getDistributionByRating(rating),
        };
      }),
    };
  }

  // 旧方式: artwork_image が0件の場合は既存の featuredImage + variationImages をそのまま使用
  // WPGraphQLのvariationImagesは降順で返ってくるため、逆順にして本来の意図する順序(01 -> 02...)に整える
  const rawVariationNodes =
    artwork.orderedImages || artwork.variationImages?.nodes || [];
  const variationNodes = [...rawVariationNodes].reverse();
  let fallbackList: any[] = [];

  if (variationNodes.length > 0) {
    fallbackList = variationNodes.map((item: any, idx: number) => ({
      id: `${artwork.databaseId || artwork.id}-${idx}`,
      title: `${artwork.title} #${String(idx + 1).padStart(2, "0")}`,
      sourceUrl:
        typeof item === "string"
          ? item
          : item.sourceUrl || item.node?.sourceUrl || "",
      altText: item.altText || artwork.title,
      contentRating: "safe",
      sortOrder: idx + 1,
      galleryVisible: true,
      distribution: getDistributionByRating("safe"),
    }));
  } else if (artwork.featuredImage?.node?.sourceUrl) {
    fallbackList = [
      {
        id: `${artwork.databaseId || artwork.id}-0`,
        title: `${artwork.title} #01`,
        sourceUrl: artwork.featuredImage.node.sourceUrl,
        altText: artwork.featuredImage.node.altText || artwork.title,
        contentRating: "safe",
        sortOrder: 1,
        galleryVisible: true,
        distribution: getDistributionByRating("safe"),
      },
    ];
  }

  return {
    hasArtworkImages: false,
    images: fallbackList,
  };
}

/**
 * ギャラリーの初期表示に必要な全データを取得します。
 * (artwork, models, sliders は WPGraphQL、artwork_image は REST API から取得するハイブリッド構成)
 */
export async function getGalleryData() {
  const [data, artworkImages] = await Promise.all([
    fetchAPI(`
      query GetGalleryData {
        generalSettings {
          title
          description
        }
        sliders(first: 50, where: { orderby: { field: MENU_ORDER, order: ASC } }) {
          nodes {
            title
            featuredImage { node { sourceUrl } }
            memberColor 
          }
        }
        models(first: 50, where: { orderby: TERM_ORDER }) {
          nodes {
            id
            name
            slug
            modelAvatar { node { sourceUrl } }
            modelBio
            memberColor 
            artworks(first: 20, where: { orderby: { field: DATE, order: DESC } }) {
              nodes {
                id
                databaseId
                title
                slug
                featuredImage { node { sourceUrl altText } }
                promptData
                variationImages(first: 50) {
                  nodes {
                    sourceUrl
                  }
                }
              }
            }
          }
        }
      }
    `),
    getAllArtworkImages(),
  ]);

  // REST APIの artwork_image を親作品の databaseId および タイトル でインデックス化
  const artworkImagesByParentId = new Map<number, any[]>();
  const artworkImagesByParentTitle = new Map<string, any[]>();
  for (const item of artworkImages) {
    let parentId: number | null = null;
    let parentTitle: string | null = null;

    if (Array.isArray(item.parent_artwork) && item.parent_artwork.length > 0) {
      const p = item.parent_artwork[0];
      parentId = Number(p.ID || p.id) || null;
      parentTitle = p.post_title || null;
    } else if (item.parent_artwork && typeof item.parent_artwork === "object") {
      parentId = Number(item.parent_artwork.ID || item.parent_artwork.id) || null;
      parentTitle = item.parent_artwork.post_title || null;
    } else if (item.parent_artwork) {
      parentId = Number(item.parent_artwork) || null;
    }

    if (parentId) {
      const list = artworkImagesByParentId.get(parentId) || [];
      list.push(item);
      artworkImagesByParentId.set(parentId, list);
    }
    if (parentTitle) {
      const clean = parentTitle.trim().toLowerCase();
      const list = artworkImagesByParentTitle.get(clean) || [];
      list.push(item);
      artworkImagesByParentTitle.set(clean, list);
    }
  }

  const models = (data?.models?.nodes || []).map((model: any) => ({
    ...model,
    artworks: {
      ...model.artworks,
      nodes: (model.artworks?.nodes || []).map((art: any) => {
        const normalized = normalizeArtworkGalleryImages(
          art,
          artworkImagesByParentId,
          artworkImagesByParentTitle
        );

        return {
          ...art,
          hasArtworkImages: normalized.hasArtworkImages,
          normalizedImages: normalized.images,
          orderedImages:
            normalized.images.length > 0
              ? normalized.images
              : art.orderedImages || art.variationImages?.nodes || [],
          likeCount: art.likeCount || 0,
          guestComments: art.guestComments || [],
        };
      }),
    },
  }));

  return {
    siteInfo: data?.generalSettings || { title: "Gallery", description: "" },
    sliders: data?.sliders?.nodes || [],
    models,
  };
}
