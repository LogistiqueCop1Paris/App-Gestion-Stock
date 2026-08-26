// Edge Function : suppression définitive d'un compte utilisateur.
// Doit tourner côté serveur car elle a besoin de la clé service_role (jamais
// exposée au navigateur) pour appeler l'API admin de Supabase Auth. Vérifie
// elle-même que l'appelant est bien "respo_log" avant de supprimer quoi que
// ce soit — ne fait jamais confiance à ce que le client prétend être.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()
    if (!userId || typeof userId !== 'string') {
      return json({ error: 'userId manquant' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'non authentifié' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Client "appelant" : utilise le jeton de la personne qui a fait la requête,
    // donc soumis à RLS — sert uniquement à vérifier qui elle est et son rôle.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData.user) {
      return json({ error: 'session invalide' }, 401)
    }
    const callerId = userData.user.id

    if (callerId === userId) {
      return json({ error: 'impossible de supprimer son propre compte' }, 400)
    }

    const { data: profile, error: profileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .single()

    if (profileError || profile?.role !== 'respo_log') {
      return json({ error: 'action réservée au rôle Respo log' }, 403)
    }

    // Client "admin" : seule la clé service_role peut supprimer un compte Auth.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) {
      return json({ error: deleteError.message }, 500)
    }

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
