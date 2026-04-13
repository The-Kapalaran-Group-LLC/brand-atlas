export async function getUserTelemetry(): Promise<{ device: string; location: string; ip_address: string }> {
  // 1. Detect Device via User Agent
  const ua = navigator.userAgent;
  let device = 'Desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android|windows phone/i.test(ua)) {
    device = 'Mobile';
  }

  // 2. Silently fetch Location via IP
  let location = 'Unknown';
  let ip_address = '';
  try {
    // Using ipapi.co (Free tier allows up to 1,000 requests/day without a key)
    const response = await fetch('https://ipapi.co/json/');
    if (response.ok) {
      const data = await response.json();
      // Formats as "San Diego, United States"
      if (data.city && data.country_name) {
        location = `${data.city}, ${data.country_name}`;
      } else if (data.country_name) {
        location = data.country_name;
      }
      if (data.ip) {
        ip_address = data.ip;
      }
    }
  } catch (error) {
    // Fail silently so it doesn't break the user's report generation
    console.warn('Silent location tracking failed:', error);
  }

  return { device, location, ip_address };
}
