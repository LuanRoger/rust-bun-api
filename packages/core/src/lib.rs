use napi_derive::napi;

#[napi]
pub fn fib(n: u32) -> u32 {
  match n {
    0 => 0,
    1 => 1,
    _ => {
      let mut a: u32 = 0;
      let mut b: u32 = 1;
      for _ in 2..=n {
        let c = a.wrapping_add(b);
        a = b;
        b = c;
      }
      b
    }
  }
}
