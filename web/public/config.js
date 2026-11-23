// إعدادات الاتصال بقاعدة البيانات.
// سيبهم فاضيين = نسخة تجريبية (الداتا على الجهاز ده بس، بتتحدث لحظياً بين التابات).
// حط بيانات مشروع Supabase = النسخة الحقيقية (كل الأجهزة، لحظي، أرشيف دائم).
window.APP_CONFIG = {
  supabaseUrl: '',      // مثال: 'https://xxxx.supabase.co'
  supabaseAnonKey: '',  // Project Settings > API > anon public key
  emailDomain: 'alsultan.app', // اسم المستخدم بيتحول لإيميل داخلي: ahmed@alsultan.app
  termDays: 15          // مدة الأجل بالأيام، من اليوم 16 العميل يحمر
};
