# Run with the unpacked MSARM 1.0.1 submission directory as the first argument.
package <- commandArgs(trailingOnly = TRUE)[[1]]
stopifnot(read.dcf(file.path(package, "DESCRIPTION"))[1, "Version"] == "1.0.1")
invisible(lapply(list.files(file.path(package, "R"), full.names = TRUE), source))
vec <- function(x) paste0("[", paste(sprintf("%.8f", x), collapse = ","), "]")
matrix_json <- function(x) paste0("[", paste(apply(x, 1, vec), collapse = ","), "]")
set.seed(42)
n <- 200L
state <- rep(c(1L, 2L, 1L, 2L, 1L), c(34L, 43L, 35L, 46L, 42L))
noise <- rnorm(n)
simulate <- function(intercept, slope, sd) {
  y <- numeric(n)
  for (t in 2:n) {
    s <- state[t]
    y[t] <- intercept[s] + slope[s] * y[t - 1] + sd[s] * noise[t]
  }
  y
}
run <- function(y, switches) {
  set.seed(12)
  fit <- MSARM.fit(y, 1, 2, switches, max_value = 120, R_value = 7)
  pred <- MSARM.predict(fit, n.ahead = 24, boot = TRUE, levels = c(.95, .80), L = 4000)
  filtered <- zeta_Yt_function(fit$alpha, fit$P, y, 2, 1)$tt[, 2:n]
  plot_path <- tempfile(fileext = ".pdf")
  pdf(plot_path)
  MSARM.plot(pred, conf = TRUE)
  invisible(dev.off())
  unlink(plot_path)
  fields <- list(y = vec(y), fitted = vec(fit$Yhat_insample),
                 transition = matrix_json(fit$P), parameters = matrix_json(fit$alpha),
                 smooth = matrix_json(fit$zeta_t_T), filtered = matrix_json(filtered),
                 forecast = vec(pred$fcast), future = matrix_json(pred$zeta_hat),
                 bands = matrix_json(t(pred$fcast_boot)),
                 metrics = vec(c(fit$LV, fit$RSS, fit$RCM, fit$Entropy)))
  paste0("{", paste(sprintf('"%s":%s', names(fields), fields), collapse = ","), "}")
}
demos <- c(
  level = run(simulate(c(-1.1, 1.1), c(.48, .48), c(.5, .5)), c(TRUE, FALSE, FALSE)),
  volatility = run(simulate(c(0, 0), c(.55, .55), c(.3, 1.25)), c(FALSE, FALSE, TRUE)),
  dynamics = run(simulate(c(-.65, .7), c(.7, -.45), c(.35, .95)), rep(TRUE, 3))
)
writeLines(paste0("window.msarmDemos = {", paste(sprintf('"%s":%s', names(demos), demos), collapse = ",\n"), "};"),
           "msarm/demo-data.js")
