// Edge Function : change l'email de connexion d'un compte, sans passer par le
// flux de confirmation par email habituel de Supabase (qui échouerait de
// toute façon sans SMTP configuré, cf README). Doit tourner côté serveur car
// elle a besoin de la clé service_role pour appeler l'API admin de Supabase
// Auth. Vérifie elle-même que l'appelant est bien "respo_log" avant d'agir —
// ne fait jamais confiance à ce que le client prétend être. Met aussi à jour
// profiles.email (simple copie d'affichage) pour rester synchronisé.
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
    const { userId, newEmail } = await req.json()
    if (!userId || typeof userId !== 'string') {
      return json({ error: 'userId manquant' }, 400)
    }
    if (!newEmail || typeof newEmail !== 'string' || !newEmail.includes('@')) {
      return json({ error: 'email invalide' }, 400)
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

    const { data: profile, error: profileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .single()

    if (profileError || profile?.role !== 'respo_log') {
      return json({ error: 'action réservée au rôle Respo log' }, 403)
    }

    // Client "admin" : seule la clé service_role peut changer un email sans
    // déclencher/attendre le flux de confirmation habituel.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    })
    if (updateError) {
      return json({ error: updateError.message }, 500)
    }

    const { error: profileUpdateError } = await adminClient
      .from('profiles')
      .update({ email: newEmail })
      .eq('id', userId)
    if (profileUpdateError) {
      return json({ error: profileUpdateError.message }, 500)
    }

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
