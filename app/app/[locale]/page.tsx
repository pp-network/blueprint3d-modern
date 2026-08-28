import { setRequestLocale } from 'next-intl/server'
import { Blueprint3DAppLoader } from '@/components/blueprint3d/Blueprint3DAppLoader'
import type { SupportedLanguage } from '@/i18n/routing'

interface HomePageProps {
  params: Promise<{ locale: SupportedLanguage }>
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="w-full h-screen overflow-hidden bg-background">
      <Blueprint3DAppLoader config={{ isLanguageOption: true }} />
    </div>
  )
}
