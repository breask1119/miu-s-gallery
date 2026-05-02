// src/lib/wp.ts

/**
 * WPGraphQLのエンドポイントに対してリクエストを送信する共通関数です。
 */
export async function fetchAPI(
  query: string,
  { variables }: { variables?: any } = {},
) {
  let wpUrl = import.meta.env.PUBLIC_WP_GRAPHQL_URL;

  // 原因1をあぶり出す：環境変数がそもそも無い場合
  if (!wpUrl) {
    console.error(
      "🚨【エラー】PUBLIC_WP_GRAPHQL_URL が設定されていません。Cloudflare Pagesの管理画面で環境変数を設定してください。",
    );
    // ※どうしても環境変数が反映されない場合は、一時的に以下のコメントアウトを外して直書きでテストしてみてください。
    // wpUrl = "https://api.xx-ai-girls-miu.com/graphql";
    return {};
  }

  if (!wpUrl.endsWith("/")) wpUrl += "/";

  const headers = {
    "Content-Type": "application/json",
    // 以前の長すぎるUser-AgentはWAFに弾かれる原因になりやすいため、シンプルなものに変更します。
    "User-Agent": "Astro-Cloudflare-Pages-Builder",
  };

  try {
    const res = await fetch(wpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    // 原因2をあぶり出す：HTTPステータスエラー（403 Forbiddenや500エラーなど）
    if (!res.ok) {
      console.error(`🚨【Fetchエラー】HTTPステータス: ${res.status}`);
      console.error(
        "WP側のサーバー（WAFやセキュリティプラグイン）にアクセスがブロックされている可能性が高いです。",
      );
      return {};
    }

    const text = await res.text();

    try {
      const json = JSON.parse(text);
      if (json.errors) {
        console.error("🚨【GraphQLエラー】:", json.errors);
        return {};
      }
      return json.data;
    } catch (e) {
      // APIエンドポイントが間違っている、またはエラー画面のHTMLが返ってきている場合
      console.error(
        "🚨【JSONパースエラー】レスポンスがJSON形式ではありません。WPがエラーHTMLなどを返している可能性があります。",
      );
      console.log("【レスポンス内容の先頭200文字】:", text.substring(0, 200));
      return {};
    }
  } catch (e) {
    // ネットワークレベルのエラー
    console.error(
      "🚨【ネットワークエラー】APIエンドポイントに全く到達できませんでした:",
      e,
    );
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
      # ▼ スライダーの順番は管理画面の順（MENU_ORDER）
      sliders(first: 10, where: { orderby: { field: MENU_ORDER, order: ASC } }) {
        nodes {
          title
          featuredImage { node { sourceUrl } }
        }
      }
      # ▼ モデルは元のプラグイン仕様（TERM_ORDER）に戻す
      models(first: 20, where: { orderby: TERM_ORDER }) {
        nodes {
          id
          name
          slug
          modelAvatar { node { sourceUrl } }
          modelBio
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
