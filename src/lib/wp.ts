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
        // ▼ ここを強化！エラーがあっても、他の正常なデータ（json.data）はレスポンスとして返すように変更。
        // これにより、一部の画像が壊れていてもサイト全体がクラッシュするのを防ぎます。
        return json.data || {};
      }
      return json.data;
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
 * ギャラリーの初期表示に必要な全データを取得します。
 */
export async function getGalleryData() {
  const data = await fetchAPI(`
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
          artworks(first: 10, where: { orderby: { field: DATE, order: DESC } }) {
            nodes {
              id
              databaseId
              title
              slug
              featuredImage { node { sourceUrl altText } }
              promptData
              orderedImages { sourceUrl }
              likeCount
              guestComments {
                id
                parentId
                author
                content
                date
              }
            }
          }
        }
      }
    }
  `);

  return {
    siteInfo: data?.generalSettings || { title: "Gallery", description: "" },
    sliders: data?.sliders?.nodes || [],
    models: data?.models?.nodes || [],
  };
}
