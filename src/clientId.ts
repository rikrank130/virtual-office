// 利用者ID。タブごとに別人として扱えるよう sessionStorage を使う。
// - 同じタブ内の再読み込みでは同じID（会話履歴を引き継ぐ）
// - 別タブ／別端末では別ID（＝別の人として広場に表示される）
// ※ ブラウザを閉じると失われます。訪問をまたいで同一人物として残すには
//   将来アカウント（ログイン）を導入し、このIDをサーバ側で発行・固定します。
const KEY = 'hiroba.clientId'

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // HTTP環境など非セキュアコンテキストでのフォールバック
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export function getClientId(): string {
  try {
    let id = sessionStorage.getItem(KEY)
    if (!id) {
      //id = crypto.randomUUID()
      id = generateUUID()
      sessionStorage.setItem(KEY, id)
    }
    return id
  } catch {
    //return crypto.randomUUID()
    return generateUUID()
  }
}