// Fetch.js
// functions for making api requests to Gens

async function request(
  url: string,
  params: Record<string, unknown>,
  method: RequestType = "GET",
) {
  // options passed to the fetch request
  const options: RequestOptions = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  // handle params
  if (params) {
    if (method === "GET") {
      url += "?" + objectToQueryString(params);
    } else {
      options.body = JSON.stringify(params);
    }
  }
  // fetch returns a promise
  const response = await fetch(url, options);

  if (response.status === 404) {
    return null;
  }

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const result = await response.json();

  // returns a single Promise object
  return result;
}

// converts an object into a URL encoded query string
// ex {region: "8:12-55"} --> region=8%3A12-55
export function objectToQueryString(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    params.append(key, String(value));
  });
  return params.toString();
}

export function get(url, params) {
  return request(url, params);
}

export function create(url, params) {
  return request(url, params, "POST");
}

export function update(url, params) {
  return request(url, params, "PUT");
}

export function remove(url, params) {
  return request(url, params, "DELETE");
}
