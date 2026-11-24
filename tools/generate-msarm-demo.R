# Run from the website root with the unpacked MSARM 1.0.1 archive as argument.
package <- commandArgs(trailingOnly = TRUE)[[1]]
stopifnot(read.dcf(file.path(package, "DESCRIPTION"))[1, "Version"] == "1.0.1")
invisible(lapply(list.files(file.path(package, "R"), full.names = TRUE), source))
vec <- function(x) paste0("[", paste(sprintf("%.8f", x), collapse = ","), "]")
matrix_json <- function(x) paste0("[", paste(apply(x, 1, vec), collapse = ","), "]")
object <- function(fields) {
  paste0("{", paste(sprintf('"%s":%s', names(fields), fields), collapse = ","), "}")
}

# Same Gaussian simulation as compare-mswm.R, including its 100-step burn-in.
simulate <- function(beta, P, n, seed) {
  set.seed(seed)
  y <- numeric(n + 100L)
  state <- rep(1L, length(y))
  for (t in 2:length(y)) {
    j <- state[t] <- sample.int(2L, 1L, prob = P[, state[t - 1L]])
    y[t] <- sum(c(1, y[t - 1L]) * beta[j, 1:2]) + rnorm(1L) * sqrt(beta[j, 3L])
  }
  list(y = tail(y, n), state = tail(state, n), beta = beta, P = P)
}

run <- function(data, switches, fit_seed) {
  set.seed(fit_seed)
  y <- data$y
  fit <- MSARM.fit(y, 1, 2, switches, max_value = 250, R_value = 5)

  # Align the fitted labels by posterior-mode agreement with the simulated path.
  truth <- data$state[-1L]
  guess <- max.col(t(fit$zeta_t_T), ties.method = "first")
  order <- if (sum(guess == truth) >= sum(3L - guess == truth)) 1:2 else 2:1
  fit$P <- fit$P[order, order]
  fit$alpha <- fit$alpha[order, ]
  fit$zeta_t_T <- fit$zeta_t_T[order, ]
  guess <- order[guess]
  pred <- MSARM.predict(fit, n.ahead = 24, boot = TRUE, levels = c(.95, .80), L = 4000)
  filtered <- zeta_Yt_function(fit$alpha, fit$P, y, 2, 1)$tt[, -1L]
  fields <- list(y = vec(y), fitted = vec(fit$Yhat_insample),
                 transition = matrix_json(fit$P), parameters = matrix_json(fit$alpha),
                 trueTransition = matrix_json(data$P), trueParameters = matrix_json(data$beta),
                 trueState = vec(data$state), decoded = vec(guess),
                 smooth = matrix_json(fit$zeta_t_T), filtered = matrix_json(filtered),
                 forecast = vec(pred$fcast), future = matrix_json(pred$zeta_hat),
                 bands = matrix_json(t(pred$fcast_boot)),
                 metrics = vec(c(fit$LV, fit$RSS, fit$RCM, fit$Entropy)))
  list(json = object(fields), guess = guess, ll = fit$LV,
       parameters = fit$alpha, transition = fit$P, error = mean(guess != truth))
}

P <- rbind(c(.96, .04), c(.04, .96))
# Intercept is the published clear/1 case in the 300-series benchmark.
level <- simulate(rbind(c(-3, .2, .5), c(3, .2, .5)), P, 160L, 1001L)
variance <- simulate(rbind(c(0, .55, .12), c(0, .55, 1.56)), P, 320L, 1042L)
full <- simulate(rbind(c(-.8, .65, .22), c(.85, -.45, .96)), P, 320L, 1042L)
fits <- list(level = run(level, c(TRUE, FALSE, FALSE), 2001L),
             volatility = run(variance, c(FALSE, FALSE, TRUE), 2042L),
             dynamics = run(full, rep(TRUE, 3), 2042L))
stopifnot(abs(fits$level$ll - (-196.110802762531)) < 1e-6,
          all(tabulate(level$state[-1L]) == c(127L, 32L)),
          all(fits$level$guess == level$state[-1L]))
for (fit in fits) {
  print(fit$parameters)
  print(fit$transition)
  print(fit$error)
}
writeLines(paste0("window.msarmDemos = ", object(lapply(fits, "[[", "json")), ";"),
           "msarm/demo-data.js")
