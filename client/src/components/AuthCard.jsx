import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

export default function AuthCard({ title, subtitle, children }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        background: "linear-gradient(160deg, #075e54 0%, #128c7e 55%, #25d366 100%)",
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 440, borderRadius: 3, boxShadow: "0 18px 45px rgba(0,0,0,.22)" }}>
        <CardContent sx={{ p: { xs: 3, sm: 4.5 }, "&:last-child": { pb: { xs: 3, sm: 4.5 } } }}>
          <Stack spacing={1} alignItems="center" sx={{ mb: 3.5, textAlign: "center" }}>
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                bgcolor: "#e7f5f1",
                color: "#075e54",
              }}
            >
              <WhatsAppIcon fontSize="medium" />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{title}</Typography>
            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
          </Stack>
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
