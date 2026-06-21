import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    supabase.from('user_profiles').select('*').eq('user_id', session.user.id)
      .maybeSingle().then(({ data }) => setProfile(data ?? false)); // false = none yet
  }, [session?.user?.id]);

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data } = await supabase.from('user_profiles').select('*')
      .eq('user_id', session.user.id).maybeSingle();
    setProfile(data ?? false);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, profile, refreshProfile,
      signOut: () => supabase.auth.signOut() }}>
      {children}
    </Ctx.Provider>
  );
}
