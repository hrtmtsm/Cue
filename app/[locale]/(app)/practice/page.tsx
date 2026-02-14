import { redirect } from 'next/navigation'

export default function PracticePage() {
  // Redirect to the clip selection screen
  redirect('/practice/select')
}

