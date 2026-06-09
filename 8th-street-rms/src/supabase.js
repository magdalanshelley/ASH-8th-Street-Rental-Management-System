import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fjxqhtwhvoptrilotxno.supabase.co'
const supabaseKey = 'sb_publishable_-lTIc5lpVoBDTqcbAZlObQ_EjrpE1zn'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)