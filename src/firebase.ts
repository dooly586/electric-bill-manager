import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, orderBy, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD62ZTxIy3SO9EXVZ4Jpek53cxWee5RWXk",
  authDomain: "gemini-manager-7a3bf.firebaseapp.com",
  projectId: "gemini-manager-7a3bf",
  storageBucket: "gemini-manager-7a3bf.firebasestorage.app",
  messagingSenderId: "915253412098",
  appId: "1:915253412098:web:f886ea0faffa9753d6021b",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export interface GeminiModel {
  id: string;
  model_id: string;
  is_active: boolean;
  priority: number;
}

// is_active: true 모델을 priority 순으로 가져오기
export async function fetchActiveModels(): Promise<GeminiModel[]> {
  const q = query(
    collection(db, 'models'),
    where('is_active', '==', true),
    orderBy('priority', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as GeminiModel));
}
