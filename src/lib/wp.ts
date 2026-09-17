// src/lib/wp.ts

/**
 * WPGraphQLのエンドポイントに対してリクエストを送信する共通関数です。
 */
export async function fetchAPI(
  query: string,
  { variables }: { variables?: any } = {},
) {
  let wpUrl = import.meta.env.PUBLIC_WP_GRAPHQL_URL;
  if (!wpUrl) return {};
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
        // ▼ エラーがあっても、他の正常なデータ（json.data）はレスポンスとして返す
        // これにより、一部の画像が壊れていてもサイト全体がクラッシュするのを防ぎます
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
  let wpUrl = import.meta.env.PUBLIC_WP_GRAPHQL_URL || "";
  if (!wpUrl) return [];

  // GraphQLのエンドポイントURLからベースURLを抽出 (例: https://api.xx-ai-girls-miu.com/graphql -> https://api.xx-ai-girls-miu.com)
  const baseUrl = wpUrl.replace(/\/graphql\/?$/i, "").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/wp-json/wp/v2/artwork_image`;

  const allItems: any[] = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const res = await fetch(`${endpoint}?per_page=${perPage}&page=${page}`, {
        headers: {
          "User-Agent": "Astro-Cloudflare-Pages-Builder",
        },
      });

      if (!res.ok) {
        // 400 (ページの範囲外など) の場合は正常終了とみなす
        if (res.status === 400) break;
        console.error(`🚨【REST APIエラー】HTTPステータス: ${res.status}`);
        break;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;

      allItems.push(...data);

      const totalPagesHeader = res.headers.get("x-wp-totalpages");
      const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
      if (page >= totalPages) break;

      page++;
    }
  } catch (err) {
    console.error("🚨【REST API artwork_image取得エラー】:", err);
  }

  return allItems;
}

/**
 * 各作品に対して REST API の artwork_image または従来の variationImages から
 * 統一されたギャラリー用画像配列を構築します。
 */
export function normalizeArtworkGalleryImages(
  artwork: any,
  artworkImagesByParentId: Map<number, any[]>
) {
  const artDbId = Number(artwork.databaseId);
  const attachedImages = artworkImagesByParentId.get(artDbId) || [];

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
        };
      }),
    };
  }

  // 旧方式: artwork_image が0件の場合は既存の featuredImage + variationImages をそのまま使用
  const variationNodes =
    artwork.orderedImages || artwork.variationImages?.nodes || [];
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

  // REST APIの artwork_image を親作品の databaseId でインデックス化
  const artworkImagesByParentId = new Map<number, any[]>();
  for (const item of artworkImages) {
    let parentId: number | null = null;
    if (Array.isArray(item.parent_artwork) && item.parent_artwork.length > 0) {
      parentId =
        Number(item.parent_artwork[0].ID || item.parent_artwork[0].id) || null;
    } else if (item.parent_artwork && typeof item.parent_artwork === "object") {
      parentId =
        Number(item.parent_artwork.ID || item.parent_artwork.id) || null;
    } else if (item.parent_artwork) {
      parentId = Number(item.parent_artwork) || null;
    }

    if (parentId) {
      const list = artworkImagesByParentId.get(parentId) || [];
      list.push(item);
      artworkImagesByParentId.set(parentId, list);
    }
  }

  const models = (data?.models?.nodes || []).map((model: any) => ({
    ...model,
    artworks: {
      ...model.artworks,
      nodes: (model.artworks?.nodes || []).map((art: any) => {
        const normalized = normalizeArtworkGalleryImages(
          art,
          artworkImagesByParentId
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
