'use client';

import { useState } from 'react';

type ManagementSection = 'PROGRAM' | 'PLAN' | 'RESOURCES' | 'STATUS';

const SECTION_GUIDES: Record<
  ManagementSection,
  {
    eyebrow: string;
    title: string;
    summary: string;
    detail: string;
    steps: string[];
  }
> = {
  PROGRAM: {
    eyebrow: 'Program',
    title: 'Dersleri haftalık çizelgeye yerleştirin',
    summary:
      'Ders Havuzu henüz programa yerleşmemiş dersleri gösterir. Bir kartı uygun saate sürükleyin; sistem sınıf, öğretmen ve salon çakışmalarını sizin için kontrol eder.',
    detail:
      'Program ekranı günlük çizelgenin asıl çalışma alanıdır. Sınıflar, öğretmenler veya salonlar görünümüne geçerek aynı programı farklı açılardan kontrol edebilirsiniz. Bir kartı seçtiğinizde sağdaki Ayrıntılar paneli o dersin gerçek yerleşimini, uygun alternatiflerini ve varsa neden yerleştirilemediğini açıklar.',
    steps: [
      'Ders Havuzu’nu açın ve yerleştirilecek kartı seçin.',
      'Kartı çizelgede uygun görünen saate sürükleyin.',
      'Birden fazla öğretmen veya salon seçeneği varsa Ayrıntılar panelinden seçim yapın.',
      'Yanlış bir işlem yaptıysanız Geri Al / Yinele ile güvenle geri dönebilirsiniz.',
    ],
  },
  PLAN: {
    eyebrow: 'Ders Planı',
    title: 'Bir dersin yapısını ve kaynak kurallarını tanımlayın',
    summary:
      'Bu bölüm haftalık yerleşimin kendisini değil, dersin kaç bloktan oluşacağını ve hangi öğretmen/salon seçenekleriyle çalışabileceğini tanımlar.',
    detail:
      'Buradaki değişiklikler tek bir program hücresinden daha geniş kapsamlıdır. Blok sayısı, ders süresi veya kaynak havuzu değişirse o derse ait uygun yerler yeniden hesaplanabilir. Programda zaten yerleşmiş bloklar varsa sistem bunu özellikle belirtir; böylece yapısal değişiklik ile tekil yerleşim düzenlemesini birbirinden ayırabilirsiniz.',
    steps: [
      'Dersi ve sınıfı bulun.',
      'Blok yapısını, öğretmen tanımını veya salon seçme yöntemini inceleyin.',
      'Programda yerleşmiş bloklar varsa yapısal değişiklikten önce uyarıları dikkate alın.',
      'Tek bir mevcut yerleşimin öğretmenini veya salonunu değiştirmek için Program > Ayrıntılar yolunu kullanın.',
    ],
  },
  RESOURCES: {
    eyebrow: 'Kaynaklar',
    title: 'Öğretmen ve salon kayıtlarını yönetin',
    summary:
      'Öğretmenlerin ve salonların adlarını, kullanılabilirlik durumlarını ve salon özelliklerini buradan yönetirsiniz. Kaynak değişiklikleri uygun yer hesaplarını etkileyebilir.',
    detail:
      'Kaynaklar ekranı “kim ve nerede ders verebilir?” sorusunun temel verisini tutar. Bir öğretmeni pasif yapmak veya bir salonu kullanım dışına almak, o kaynağa bağlı uygun yerleri etkileyebilir. Salon özellikleri de belirli derslerin hangi mekânlarda çalışabileceğini belirler.',
    steps: [
      'Öğretmen veya salon listesinden kaynağı seçin.',
      'Ad, aktiflik veya salon özelliği gibi gerekli alanı değiştirin.',
      'Etkisi olan işlemlerde önizlemeyi kontrol edin.',
      'Kullanımda olan kaynakları silmek yerine durumunu yönetmeyi tercih edin.',
    ],
  },
  STATUS: {
    eyebrow: 'Program Durumu',
    title: 'Taslağın yayınlanmaya ne kadar hazır olduğunu görün',
    summary:
      'Eksik yerleşimler, veri sorunları ve yayın öncesi kontroller burada özetlenir. Bu ekran programı düzenlemekten çok kontrol etmek için kullanılır.',
    detail:
      'Program Durumu ekranı bir kontrol panelidir. Buradaki uyarılar genellikle Program, Ders Planı veya Kaynaklar bölümünde çözülecek bir eksikliği işaret eder. Amaç yalnız “kaç ders kaldı?” sorusunu değil, taslağın yayınlanmasını engelleyebilecek veri ve yerleşim sorunlarını da tek yerde göstermektir.',
    steps: [
      'Ortaokul / Lise kapsamını seçin.',
      'Eksik veya uyarı üreten başlıkları inceleyin.',
      'Sorunu Program, Ders Planı veya Kaynaklar bölümünde düzeltin.',
      'Yayın adımından önce durum ekranını son kontrol noktası olarak kullanın.',
    ],
  },
};

const GLOSSARY = [
  {
    term: 'Ders Havuzu',
    text: 'Henüz haftalık programa yerleştirilmemiş ders kartlarının bulunduğu alan.',
    detail:
      'Havuzdaki bir kart, ders planında tanımlıdır fakat henüz gün ve saat kazanmamıştır. Kartı çizelgeye sürüklediğinizde sistem o ders için önceden hesaplanmış uygun yerleri kullanır.',
  },
  {
    term: 'Yerleşim',
    text: 'Bir ders kartının belirli gün ve saatte, öğretmen ve salon bilgisiyle programda bulunması.',
    detail:
      'Yerleşim, ders planından farklı olarak somut program sonucudur. Mevcut bir yerleşimin öğretmenini veya salonunu değiştirmek yalnız o yerleşimi etkiler; dersin genel kaynak tanımını değiştirmez.',
  },
  {
    term: 'Belirsiz',
    text: 'Bir hata anlamına gelmez. Öğretmen veya salon henüz kesinleşmemiş olabilir.',
    detail:
      'Belirsiz bir kaynak “yok” veya “uygun değil” demek değildir. Sistem o ders için geçerli bir yer bulabiliyorsa ders programa alınabilir; kesin kaynak seçimi daha sonra tamamlanabilir.',
  },
  {
    term: 'Ortak kart',
    text: '5A + 5B gibi birden fazla sınıfı birlikte temsil eden tek görsel kart.',
    detail:
      'Ekranda tek kart görünmesine rağmen altta sınıflara ait ayrı kayıtlar korunur. Yerleştirme, taşıma, kaldırma, Geri Al ve Yinele işlemleri bu kayıtlar için birlikte yürütülür.',
  },
  {
    term: 'Uygun / Uygun değil',
    text: 'Sistemin o saat için sınıf, öğretmen, salon ve ders kurallarını değerlendirmesidir.',
    detail:
      'Uygun olmayan bir hedef yalnızca “kırmızı alan” değildir. Ayrıntılar paneli, mümkün olduğunda hangi dersin, öğretmenin veya salonun bu hedefi engellediğini açıklar.',
  },
  {
    term: 'Geri Al / Yinele',
    text: 'Son program işlemini geri alır veya yeniden uygular.',
    detail:
      'Birleşik derslerde işlem tek bir kullanıcı hareketi olarak korunur. Böylece 5A + 5B gibi ortak kartları yanlışlıkla parçalara ayırmadan geri alabilir veya yeniden uygulayabilirsiniz.',
  },
];

export function ManagementHelpCenter({
  open,
  activeSection,
  onClose,
  onNavigate,
}: {
  open: boolean;
  activeSection: ManagementSection;
  onClose: () => void;
  onNavigate: (section: ManagementSection) => void;
}) {
  const [showAllTerms, setShowAllTerms] = useState(false);
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  if (!open) return null;

  const guide = SECTION_GUIDES[activeSection];
  const visibleTerms = showAllTerms ? GLOSSARY : GLOSSARY.slice(0, 3);

  const navigate = (section: ManagementSection) => {
    onNavigate(section);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Yönetim yardım merkezi">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Yardımı kapat"
      />

      <aside className="absolute inset-y-0 right-0 flex w-[min(408px,calc(100vw-1rem))] flex-col border-l border-slate-200 bg-[#FCFBF8] shadow-[-24px_0_70px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A63D48]">
              Yardım Merkezi
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Yönetim nasıl çalışır?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            Kapat
          </button>
        </div>

        <div className="management-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
              Şu anda · {guide.eyebrow}
            </p>
            <h3 className="mt-1 text-[15px] font-black text-slate-950">
              {guide.title}
            </h3>
            <p className="mt-2 text-[10px] font-medium leading-5 text-slate-600">
              {guide.summary}
            </p>
            <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-medium leading-5 text-slate-500">
              {guide.detail}
            </p>

            <div className="mt-3 space-y-1.5">
              {guide.steps.map((step, index) => (
                <div key={step} className="flex gap-2.5 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[9px] font-black text-white">
                    {index + 1}
                  </span>
                  <p className="text-[10px] font-semibold leading-5 text-slate-700">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Dört ana bölüm
                </p>
                <p className="mt-0.5 text-[9px] font-medium text-slate-400">
                  Bölüme gitmek için kartı seçin.
                </p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {(Object.keys(SECTION_GUIDES) as ManagementSection[]).map((section) => {
                const item = SECTION_GUIDES[section];
                const active = section === activeSection;
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() => navigate(section)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      active
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <p className={`text-[9px] font-black uppercase tracking-[0.12em] ${
                      active ? 'text-slate-300' : 'text-slate-400'
                    }`}>
                      {item.eyebrow}
                    </p>
                    <p className="mt-1 text-[10px] font-bold leading-4">
                      {item.title}
                    </p>
                    <p className={`mt-2 text-[9px] font-bold ${
                      active ? 'text-slate-300' : 'text-[#A63D48]'
                    }`}>
                      {active ? 'Bu bölümdesiniz' : 'Bölüme git →'}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                Temel kavramlar
              </p>
              {GLOSSARY.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllTerms((value) => !value)}
                  className="text-[9px] font-black text-[#A63D48] hover:underline"
                >
                  {showAllTerms ? 'Kısalt' : 'Tümünü göster'}
                </button>
              )}
            </div>

            <div className="mt-2 space-y-1.5">
              {visibleTerms.map((item) => {
                const expanded = expandedTerm === item.term;
                return (
                  <button
                    key={item.term}
                    type="button"
                    onClick={() => setExpandedTerm(expanded ? null : item.term)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black text-slate-900">
                        {item.term}
                      </p>
                      <span className="text-[12px] font-bold text-slate-400">
                        {expanded ? '−' : '+'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] font-medium leading-5 text-slate-600">
                      {item.text}
                    </p>
                    {expanded && (
                      <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-medium leading-5 text-slate-500">
                        {item.detail}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 rounded-[20px] border border-blue-200 bg-blue-50/70 p-3.5">
            <p className="text-[10px] font-black text-blue-950">
              Ders Planı ile Yerleşim aynı şey değildir
            </p>
            <p className="mt-1 text-[10px] font-medium leading-5 text-blue-800">
              Ders Planı, bir dersin hangi öğretmen ve salon seçenekleriyle çalışabileceğini tanımlar.
              Programdaki “Yerleşimi düzenle” işlemi ise yalnızca seçili mevcut yerleşimin öğretmenini
              veya salonunu değiştirir; Ders Planı havuzunu değiştirmez.
            </p>
          </section>

          <section className="mt-2 rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-3.5">
            <p className="text-[10px] font-black text-emerald-950">
              “Uygun değil” tek başına son cevap değildir
            </p>
            <p className="mt-1 text-[10px] font-medium leading-5 text-emerald-800">
              Sistem mümkün olduğunda nedeni da gösterir: sınıfın başka dersi olabilir, öğretmen dolu
              olabilir veya salon kullanılıyor olabilir. Kartı seçip Ayrıntılar paneline bakarak gerçek
              engeli görebilirsiniz.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
